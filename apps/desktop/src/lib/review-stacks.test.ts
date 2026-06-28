import { describe, expect, it } from "vitest";
import { buildReviewStackModel } from "./review-stacks";
import type { CachedFileSummary, CachedReviewThread } from "./pr-cache";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ReviewStackContractFixture {
  input: {
    files: CachedFileSummary[];
    reviewThreads: CachedReviewThread[];
  };
  expected: {
    stacks: ReturnType<typeof summarizeStacks>;
  };
}

function file(path: string, overrides: Partial<CachedFileSummary> = {}): CachedFileSummary {
  return {
    path,
    additions: 10,
    deletions: 2,
    status: "modified",
    patch: "@@ -1,2 +1,3 @@\n export const value = 1;\n+export const next = 2;",
    viewerViewedState: "UNVIEWED",
    ...overrides,
  };
}

describe("buildReviewStackModel", () => {
  it("matches the shared review stack contract fixture", () => {
    const fixture = readReviewStackFixture();
    const model = buildReviewStackModel(fixture.input);

    expect(summarizeStacks(model.stacks)).toEqual(fixture.expected.stacks);
  });

  it("orders contracts, core, interface, tests, docs, and generated files deterministically", () => {
    const model = buildReviewStackModel({
      files: [
        file("src/components/BillingPanel.tsx"),
        file("docs/review-stack.md"),
        file("src/billing/checkout.test.ts"),
        file("schemas/billing.graphql"),
        file("src/billing/checkout.ts"),
        file("src/generated/api.ts"),
      ],
      reviewThreads: [],
    });

    expect(model.stacks.map((stack) => stack.kind)).toEqual([
      "contracts",
      "core",
      "interface",
      "tests",
      "docs",
      "generated",
    ]);
  });

  it("counts thread activity and viewed progress per stack", () => {
    const threads: CachedReviewThread[] = [
      {
        id: "thread-1",
        authorLogin: "coderabbitai",
        filePath: "src/billing/checkout.ts",
        line: 4,
        state: "unresolved",
        body: "Check this path.",
        updatedAt: "2026-06-18T12:00:00Z",
      },
      {
        id: "thread-2",
        authorLogin: "monalisa",
        filePath: "src/billing/checkout.ts",
        line: 8,
        state: "resolved",
        body: "Resolved.",
        updatedAt: "2026-06-18T12:01:00Z",
      },
    ];

    const model = buildReviewStackModel({
      files: [
        file("src/billing/checkout.ts", { viewerViewedState: "VIEWED" }),
        file("src/billing/tax.ts", { viewerViewedState: "UNVIEWED" }),
      ],
      reviewThreads: threads,
    });

    expect(model.stacks).toHaveLength(1);
    expect(model.stacks[0].commentCount).toBe(2);
    expect(model.stacks[0].viewedFileCount).toBe(1);
    expect(model.stacks[0].totalFileCount).toBe(2);
    expect(model.filesByPath.get("src/billing/checkout.ts")?.unresolvedCommentCount).toBe(1);
  });

  it("keeps stable stack and layer ids for the same inputs", () => {
    const files = [file("src/billing/checkout.ts"), file("src/billing/tax.ts")];
    const first = buildReviewStackModel({ files }).stacks;
    const second = buildReviewStackModel({ files: files.slice().reverse() }).stacks;

    expect(second.map((stack) => stack.id)).toEqual(first.map((stack) => stack.id));
    expect(second.flatMap((stack) => stack.layers.map((layer) => layer.id))).toEqual(
      first.flatMap((stack) => stack.layers.map((layer) => layer.id)),
    );
  });
});

function readReviewStackFixture(): ReviewStackContractFixture {
  const raw = readFileSync(resolve("../../packages/contracts/fixtures/review-stack-basic.json"), "utf8");
  return JSON.parse(raw) as ReviewStackContractFixture;
}

function summarizeStacks(stacks: ReturnType<typeof buildReviewStackModel>["stacks"]) {
  return stacks.map((stack) => ({
    title: stack.title,
    kind: stack.kind,
    filePaths: stack.filePaths,
    viewedFileCount: stack.viewedFileCount,
    totalFileCount: stack.totalFileCount,
    commentCount: stack.commentCount,
    layers: stack.layers.map((layer) => ({
      title: layer.title,
      filePaths: layer.filePaths,
      viewedState: layer.viewedState,
      commentCount: layer.commentCount,
    })),
  }));
}
