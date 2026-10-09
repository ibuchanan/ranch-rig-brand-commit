const COMMENT_LINE = /^#/;

function firstCommentIndex(lines: string[]): number {
  return lines.findIndex((line) => COMMENT_LINE.test(line));
}

export function hasMessage(contents: string): boolean {
  const lines = contents.split("\n");
  const firstComment = firstCommentIndex(lines);

  return lines.slice(0, firstComment === -1 ? undefined : firstComment).join("\n").trim() !== "";
}

export function withMessage(contents: string, message: string): string {
  const lines = contents.split("\n");

  return [message, ...lines.slice(firstCommentIndex(lines))].join("\n");
}
