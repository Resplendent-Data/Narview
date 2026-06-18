import { describe, expect, it } from "vitest";
import { buildCodeSymbolIndex, inferHydratableDefinitionPaths, resolveCodeSymbolRecord } from "./code-symbols";
import type { CachedFileSummary } from "./pr-cache";

function pythonFile(): CachedFileSummary {
  return {
    path: "src/general.py",
    additions: 0,
    deletions: 0,
    status: "modified",
    patch: [
      "@@ -1,10 +1,10 @@",
      " async def first(",
      "     calculation_uuids,",
      " ):",
      "     safe_uuids = calculation_uuids",
      "     return safe_uuids",
      " ",
      " async def second(",
      "     calculation_uuids,",
      " ):",
      "     return calculation_uuids",
    ].join("\n"),
  };
}

function changedLocalFile(): CachedFileSummary {
  return {
    path: "src/general.py",
    additions: 2,
    deletions: 2,
    status: "modified",
    patch: [
      "@@ -1,7 +1,7 @@",
      " async def subscribe_to_calculations():",
      "-    res = await request.session.execute(select_stmt)",
      "-    for row in res:",
      "+    res = await request.session.execute(select_stmt)",
      "+    for row in res:",
      "         return row",
    ].join("\n"),
  };
}

function settingsFile(): CachedFileSummary {
  return {
    path: "src/settings.py",
    additions: 1,
    deletions: 0,
    status: "modified",
    patch: [
      "@@ -1,3 +1,4 @@",
      " class Settings:",
      "+    ai_tool_source_row_limit: int",
      "     other_setting: str = \"x\"",
    ].join("\n"),
  };
}

function settingsConsumerFile(): CachedFileSummary {
  return {
    path: "apps/backend/src/scripts/services/query_datasets/definitions.py",
    additions: 1,
    deletions: 0,
    status: "modified",
    patch: [
      "@@ -1,5 +1,5 @@",
      " from settings import settings",
      "+_MAX_RESULT_ROW_LIMIT = settings.ai_tool_source_row_limit",
    ].join("\n"),
  };
}

function repeatedLocalParameterFile(): CachedFileSummary {
  return {
    path: "apps/backend/src/scripts/services/query_datasets/definitions.py",
    additions: 18,
    deletions: 0,
    status: "modified",
    patch: [
      "@@ -850,20 +850,20 @@",
      "+def _validate_relation_references(",
      "+    definition: QueryDatasetDefinition,",
      "+    normalized_sql: str,",
      "+) -> list[DefinitionValidationError]:",
      "+    references = [",
      "+        normalize_relation_reference(reference)",
      "+        for reference in extract_relation_references(normalized_sql)",
      "+    ]",
      "+    return references",
      "+",
      "+def _estimate_cost_signals(",
      "+    definition: QueryDatasetDefinition,",
      "+    normalized_sql: str,",
      "+) -> list[DefinitionValidationError]:",
      "+    assert normalized_sql is not None",
      "+    return _validate_relation_references(definition, normalized_sql)",
    ].join("\n"),
  };
}

describe("code symbol scopes", () => {
  it("resolves Python locals to definitions and references in the clicked function scope", () => {
    const index = buildCodeSymbolIndex([pythonFile()]);
    const globalRecord = index.recordsByName.get("calculation_uuids");

    expect(globalRecord?.definitions.map((location) => location.line)).toEqual([2, 8]);

    const scopedRecord = resolveCodeSymbolRecord(index, {
      name: "calculation_uuids",
      path: "src/general.py",
      line: 4,
    });

    expect(scopedRecord?.scoped).toBe(true);
    expect(scopedRecord?.scopeName).toBe("function first");
    expect(scopedRecord?.definitions.map((location) => location.line)).toEqual([2]);
    expect(scopedRecord?.references.map((location) => location.line)).toEqual([4]);
  });

  it("keeps reused Python parameter references inside the clicked function", () => {
    const index = buildCodeSymbolIndex([repeatedLocalParameterFile()]);
    const globalRecord = index.recordsByName.get("normalized_sql");

    expect(globalRecord?.definitions.map((location) => location.line)).toEqual([852, 862]);

    const scopedRecord = resolveCodeSymbolRecord(index, {
      name: "normalized_sql",
      path: "apps/backend/src/scripts/services/query_datasets/definitions.py",
      line: 856,
    });

    expect(scopedRecord?.scoped).toBe(true);
    expect(scopedRecord?.scopeName).toBe("function _validate_relation_references");
    expect(scopedRecord?.definitions.map((location) => location.line)).toEqual([852]);
    expect(scopedRecord?.references.map((location) => location.line)).toEqual([856]);
  });

  it("collapses equivalent removed and added local occurrences into one changed symbol row", () => {
    const index = buildCodeSymbolIndex([changedLocalFile()]);
    const scopedRecord = resolveCodeSymbolRecord(index, {
      name: "res",
      path: "src/general.py",
      line: 3,
    });

    expect(scopedRecord?.definitions).toHaveLength(1);
    expect(scopedRecord?.references).toHaveLength(1);
    expect(scopedRecord?.definitions[0].sides).toEqual(["LEFT", "RIGHT"]);
    expect(scopedRecord?.references[0].sides).toEqual(["LEFT", "RIGHT"]);
  });

  it("treats Python annotated settings fields as definitions when the settings file is loaded", () => {
    const index = buildCodeSymbolIndex([settingsFile()]);
    const record = index.recordsByName.get("ai_tool_source_row_limit");

    expect(record?.definitions.map((location) => location.line)).toEqual([2]);
  });

  it("infers a source file to hydrate from Python attribute imports", () => {
    const files = [settingsConsumerFile()];
    const index = buildCodeSymbolIndex(files);
    const record = resolveCodeSymbolRecord(index, {
      name: "ai_tool_source_row_limit",
      path: "apps/backend/src/scripts/services/query_datasets/definitions.py",
      line: 2,
    });

    expect(
      inferHydratableDefinitionPaths({
        selection: {
          name: "ai_tool_source_row_limit",
          path: "apps/backend/src/scripts/services/query_datasets/definitions.py",
          line: 2,
        },
        record,
        files,
      }),
    ).toContain("apps/backend/src/settings.py");
  });

  it("adds definitions from hydrated source files to the symbol index", () => {
    const index = buildCodeSymbolIndex([settingsConsumerFile()], [
      {
        path: "apps/backend/src/settings.py",
        content: ["class Settings:", "    ai_tool_source_row_limit: int = 100_000"].join("\n"),
      },
    ]);
    const record = resolveCodeSymbolRecord(index, {
      name: "ai_tool_source_row_limit",
      path: "apps/backend/src/scripts/services/query_datasets/definitions.py",
      line: 2,
    });

    expect(record?.definitions.map((location) => `${location.path}:${location.line}`)).toEqual(["apps/backend/src/settings.py:2"]);
  });
});
