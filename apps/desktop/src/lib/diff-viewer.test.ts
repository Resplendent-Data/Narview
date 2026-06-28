import { describe, expect, it } from "vitest";
import { buildLazyDiffState, getDefaultLoadedDiffHunkIds } from "./diff-viewer";
import type { CachedFileSummary } from "./pr-cache";

const filePath = "src/example.py";
const firstHunkId = `${filePath}:hunk-1`;
const secondHunkId = `${filePath}:hunk-2`;

function changedSourceContent() {
  return Array.from({ length: 60 }, (_, index) => {
    const line = index + 1;
    if (line === 11) {
      return "line 11 changed";
    }

    if (line === 21) {
      return "line 21 changed";
    }

    return `line ${line}`;
  }).join("\n");
}

function changedFile(): CachedFileSummary {
  return {
    path: filePath,
    additions: 2,
    deletions: 2,
    status: "modified",
    patch: [
      "@@ -10,3 +10,3 @@ def first",
      " line 10",
      "-line 11",
      "+line 11 changed",
      " line 12",
      "@@ -20,3 +20,3 @@ def second",
      " line 20",
      "-line 21",
      "+line 21 changed",
      " line 22",
    ].join("\n"),
  };
}

function valueErrorSourceContent() {
  return [
    "def remap_join_tables():",
    "    for old_jt_uuid, new_jt_uuid in join_table_map.items():",
    "        if old_jt_uuid not in blob_join_table_uuids:",
    "            raise ValueError(",
    '                f"join_table_map key \'{old_jt_uuid}\' does not match any join-table UUID in the export blob"',
    "            )",
    "        existing_jt = await request.session.scalar(",
    "            select(ClientTables).where(",
    "                ClientTables.pk_table_uuid == new_jt_uuid,",
    "            )",
    "        )",
    "        if not existing_jt:",
    "            raise ValueError(",
    '                f"join_table_map target \'{new_jt_uuid}\' is not an existing join table in your company"',
    "            )",
    "        if old_jt_uuid != new_jt_uuid:",
    "            table_uuid_remap[old_jt_uuid] = new_jt_uuid",
  ].join("\n");
}

function valueErrorFile(): CachedFileSummary {
  return {
    path: filePath,
    additions: 2,
    deletions: 4,
    status: "modified",
    patch: [
      "@@ -2,8 +2,6 @@ def remap_join_tables",
      "     for old_jt_uuid, new_jt_uuid in join_table_map.items():",
      "         if old_jt_uuid not in blob_join_table_uuids:",
      "             raise ValueError(",
      '-                f"join_table_map key \'{old_jt_uuid}\' does not match any "',
      '-                "join-table UUID in the export blob"',
      '+                f"join_table_map key \'{old_jt_uuid}\' does not match any join-table UUID in the export blob"',
      "             )",
      "@@ -9,9 +7,9 @@ def remap_join_tables",
      "         existing_jt = await request.session.scalar(",
      "             select(ClientTables).where(",
      "                 ClientTables.pk_table_uuid == new_jt_uuid,",
      "             )",
      "         )",
      "         if not existing_jt:",
      "             raise ValueError(",
      '-                f"join_table_map target \'{new_jt_uuid}\' is not an existing "',
      '-                "join table in your company"',
      '+                f"join_table_map target \'{new_jt_uuid}\' is not an existing join table in your company"',
      "             )",
    ].join("\n"),
  };
}

function missingPatchFile(): CachedFileSummary {
  return {
    path: "src/example.ts",
    additions: 4,
    deletions: 2,
    status: "modified",
  };
}

describe("buildLazyDiffState", () => {
  it("does not synthesize example code when patch content is missing", () => {
    const file = missingPatchFile();
    const state = buildLazyDiffState(file, {
      mode: "unified",
      repository: "owner/repo",
      pullRequestNumber: 123,
      loadedHunkIds: getDefaultLoadedDiffHunkIds(file),
      fullFileLoaded: true,
    });

    expect(getDefaultLoadedDiffHunkIds(file)).toEqual([]);
    expect(state.hunks).toEqual([]);
    expect(state.fullFileLines).toBeNull();
  });

  it("keeps separate patch hunks separate before context expansion overlaps", () => {
    const state = buildLazyDiffState(changedFile(), {
      mode: "unified",
      repository: "owner/repo",
      pullRequestNumber: 123,
      sourceContent: changedSourceContent(),
    });

    expect(state.hunks).toHaveLength(2);
  });

  it("combines expanded hunks when their visible ranges overlap", () => {
    const state = buildLazyDiffState(changedFile(), {
      mode: "unified",
      repository: "owner/repo",
      pullRequestNumber: 123,
      sourceContent: changedSourceContent(),
      expandedHunkContexts: {
        [firstHunkId]: { before: 0, after: 20 },
      },
    });

    expect(state.hunks).toHaveLength(1);
    expect(state.hunks[0].sourceHunkIds).toEqual([firstHunkId, secondHunkId]);
    expect(state.hunks[0].expandAfterHunkId).toBe(firstHunkId);
    expect(state.hunks[0].lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "deletion", oldLine: 21, content: "line 21" }),
        expect.objectContaining({ kind: "addition", newLine: 21, content: "line 21 changed" }),
      ]),
    );
    expect(state.hunks[0].lines.filter((line) => line.kind === "context" && line.content === "line 21 changed")).toHaveLength(0);
  });

  it("keeps multi-line deletions in patch order when expanded source context overlaps the next hunk", () => {
    const state = buildLazyDiffState(valueErrorFile(), {
      mode: "unified",
      repository: "owner/repo",
      pullRequestNumber: 123,
      sourceContent: valueErrorSourceContent(),
      expandedHunkContexts: {
        [firstHunkId]: { before: 0, after: 20 },
      },
    });

    expect(state.hunks).toHaveLength(1);

    const contents = state.hunks[0].lines.map((line) => line.content.trim());
    const existingQueryIndex = contents.indexOf("existing_jt = await request.session.scalar(");
    const targetDeletionStartIndex = contents.indexOf('f"join_table_map target \'{new_jt_uuid}\' is not an existing "');
    const targetDeletionEndIndex = contents.indexOf('"join table in your company"');
    const targetAdditionIndex = contents.indexOf('f"join_table_map target \'{new_jt_uuid}\' is not an existing join table in your company"');

    expect(existingQueryIndex).toBeGreaterThan(-1);
    expect(targetDeletionStartIndex).toBeGreaterThan(existingQueryIndex);
    expect(targetDeletionEndIndex).toBe(targetDeletionStartIndex + 1);
    expect(targetAdditionIndex).toBeGreaterThan(targetDeletionEndIndex);
  });
});
