import { describe, expect, it } from "vitest";
import type { AttentionRelationship } from "./analysis-index";
import { buildReviewPathItems } from "./review-path";
import type { HotspotScore } from "./review-overview";
import type { ReviewTarget } from "./review-targets";

describe("buildReviewPathItems", () => {
  it("walks the strongest related cluster before moving to an unrelated target", () => {
    const root = createReviewTarget({
      id: "target-root",
      title: "Root change",
      nodeIds: ["node-root"],
      paths: ["src/root.ts"],
    });
    const neighbor = createReviewTarget({
      id: "target-neighbor",
      title: "Neighbor change",
      nodeIds: ["node-neighbor"],
      paths: ["src/neighbor.ts"],
    });
    const downstream = createReviewTarget({
      id: "target-downstream",
      title: "Downstream change",
      nodeIds: ["node-downstream"],
      paths: ["src/downstream.ts"],
    });
    const unrelated = createReviewTarget({
      id: "target-unrelated",
      title: "Unrelated change",
      nodeIds: ["node-unrelated"],
      paths: ["src/unrelated.ts"],
    });

    const items = buildReviewPathItems(
      [unrelated, downstream, neighbor, root],
      [
        createHotspot("src/root.ts", 90),
        createHotspot("src/unrelated.ts", 80),
        createHotspot("src/neighbor.ts", 3),
        createHotspot("src/downstream.ts", 1),
      ],
      {
        relationships: [
          createRelationship("root-neighbor", "node-root", "node-neighbor", "src/root.ts", "src/neighbor.ts"),
          createRelationship(
            "neighbor-downstream",
            "node-neighbor",
            "node-downstream",
            "src/neighbor.ts",
            "src/downstream.ts",
          ),
        ],
      },
    );

    expect(items.map((item) => item.id)).toEqual([
      "target-root",
      "target-neighbor",
      "target-downstream",
      "target-unrelated",
    ]);
    expect(items[0].cluster).toMatchObject({ order: 1, size: 3, seedTargetId: "target-root", distanceFromSeed: 0 });
    expect(items[1].cluster).toMatchObject({ order: 1, size: 3, seedTargetId: "target-root", distanceFromSeed: 1 });
    expect(items[2].cluster).toMatchObject({ order: 1, size: 3, seedTargetId: "target-root", distanceFromSeed: 2 });
    expect(items[3].cluster).toMatchObject({ order: 2, size: 1, seedTargetId: "target-unrelated", distanceFromSeed: 0 });
    expect(items[0].orderingReasons).toContain("Starts related cluster (3 targets)");
    expect(items[1].orderingReasons).toContain("Connected cluster target 2 of 3");
  });

  it("uses the highest scoring target as the seed inside a related cluster", () => {
    const lowerInputFirst = createReviewTarget({
      id: "target-lower",
      title: "Lower score",
      nodeIds: ["node-lower"],
      paths: ["src/lower.ts"],
    });
    const higherInputSecond = createReviewTarget({
      id: "target-higher",
      title: "Higher score",
      nodeIds: ["node-higher"],
      paths: ["src/higher.ts"],
    });

    const items = buildReviewPathItems(
      [lowerInputFirst, higherInputSecond],
      [createHotspot("src/lower.ts", 15), createHotspot("src/higher.ts", 70)],
      {
        relationships: [createRelationship("higher-lower", "node-higher", "node-lower", "src/higher.ts", "src/lower.ts")],
      },
    );

    expect(items.map((item) => item.id)).toEqual(["target-higher", "target-lower"]);
    expect(items.every((item) => item.cluster.seedTargetId === "target-higher")).toBe(true);
  });
});

function createReviewTarget(overrides: Partial<ReviewTarget> & Pick<ReviewTarget, "id" | "title" | "paths">): ReviewTarget {
  return {
    stableKey: overrides.id,
    fingerprint: `${overrides.id}:fingerprint`,
    kind: "node-group",
    priority: "normal",
    nodeIds: [overrides.id],
    edgeIds: [],
    reviewThreadIds: [],
    filePath: overrides.paths.length === 1 ? overrides.paths[0] : null,
    modulePath: overrides.paths[0]?.split("/").slice(0, -1).join("/") || "src",
    fallback: false,
    reasoning: ["Test target."],
    size: {
      nodes: 1,
      files: overrides.paths.length,
      changedLines: 10,
      relationships: 0,
      reviewThreads: 0,
    },
    ...overrides,
  };
}

function createHotspot(path: string, score: number): HotspotScore {
  return {
    kind: "file",
    path,
    score,
    changedLines: score,
    unresolvedThreads: 0,
    reasons: [`Hotspot fixture score ${score}`],
  };
}

function createRelationship(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  filePath: string,
  targetFilePath: string,
): AttentionRelationship {
  return {
    id,
    kind: "module-import",
    filePath,
    fromNodeId,
    toNodeId,
    fromSymbolName: fromNodeId,
    toSymbolName: toNodeId,
    targetModule: null,
    targetFilePath,
    line: 1,
    reason: `${fromNodeId} relates to ${toNodeId}.`,
  };
}
