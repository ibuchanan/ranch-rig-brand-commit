export const LEFTHOOK_UNFILLED_PLACEHOLDER = "{2}";

export const NO_SOURCE_SOURCES = ["message", "template", "merge", "squash", "commit"];

export function isBareCommit(source: string | undefined): boolean {
  return source === undefined || source === "" || source === LEFTHOOK_UNFILLED_PLACEHOLDER;
}
