import type { ReviewTargetInspectorModel } from "./review-target-inspector";

export type ReviewThreadAnchorSide = "LEFT" | "RIGHT";

export interface ReviewThreadLineAnchor {
  id: string;
  path: string;
  line: number;
  side: ReviewThreadAnchorSide;
  label: string;
}

export interface ReviewThreadFileAnchor {
  path: string;
}

export interface DisabledReviewThreadAnchor {
  reason: string;
}

export function buildReviewThreadLineAnchors(model: ReviewTargetInspectorModel | null): ReviewThreadLineAnchor[] {
  if (!model) {
    return [];
  }

  const anchors = new Map<string, ReviewThreadLineAnchor>();
  for (const context of model.changedContexts) {
    for (const line of context.lines) {
      const anchor =
        line.kind === "addition" && line.newLine !== null
          ? { path: context.path, line: line.newLine, side: "RIGHT" as const, label: `${context.path}:${line.newLine} added line` }
        : line.kind === "deletion" && line.oldLine !== null
          ? { path: context.path, line: line.oldLine, side: "LEFT" as const, label: `${context.path}:${line.oldLine} removed line` }
          : line.kind === "context" && line.newLine !== null
            ? { path: context.path, line: line.newLine, side: "RIGHT" as const, label: `${context.path}:${line.newLine} context line` }
            : null;

      if (!anchor) {
        continue;
      }

      anchors.set(`${anchor.path}:${anchor.side}:${anchor.line}`, {
        id: `${anchor.path}:${anchor.side}:${anchor.line}`,
        ...anchor,
      });
    }
  }

  return [...anchors.values()].sort(
    (left, right) => left.path.localeCompare(right.path) || left.line - right.line || left.side.localeCompare(right.side),
  );
}

export function getReviewThreadLineAnchorState(
  model: ReviewTargetInspectorModel | null,
): { anchors: ReviewThreadLineAnchor[]; disabled: DisabledReviewThreadAnchor | null } {
  const anchors = buildReviewThreadLineAnchors(model);
  if (anchors.length > 0) {
    return { anchors, disabled: null };
  }

  return {
    anchors,
    disabled: {
      reason: model
        ? "Line-level Review Threads need a diff line inside this Review Target."
        : "Select a Review Target before starting a line-level Review Thread.",
    },
  };
}

export function getReviewThreadFileAnchorState(
  model: ReviewTargetInspectorModel | null,
): { anchor: ReviewThreadFileAnchor | null; disabled: DisabledReviewThreadAnchor | null } {
  if (!model) {
    return {
      anchor: null,
      disabled: { reason: "Select a Review Target before starting a File Review Thread." },
    };
  }

  if (!model.target.filePath) {
    return {
      anchor: null,
      disabled: { reason: "File Review Threads require a single-file Review Target." },
    };
  }

  return {
    anchor: { path: model.target.filePath },
    disabled: null,
  };
}
