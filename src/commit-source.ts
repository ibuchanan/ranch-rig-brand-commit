export const LEFTHOOK_UNFILLED_PLACEHOLDER = "{2}";

export const SKIP_SOURCES = ["message", "template", "merge", "squash", "commit"];

export type CommitSourceDecision =
  { kind: "generate" } | { kind: "skip" } | { kind: "unrecognised"; source: string };

export function decideCommitSource(source: string | undefined): CommitSourceDecision {
  if (source === undefined || source === "" || source === LEFTHOOK_UNFILLED_PLACEHOLDER) {
    return { kind: "generate" };
  }

  if (SKIP_SOURCES.includes(source)) {
    return { kind: "skip" };
  }

  return { kind: "unrecognised", source };
}
