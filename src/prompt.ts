import type { Capture } from "./staged-diff";

const PROMPT =
  "Use the git-commit skill to write the commit message for the staged change on " +
  "standard input. Reply with the message text only, with no fences, quotes or preamble.";

type Captured = Extract<Capture, { kind: "captured" }>;

/**
 * The diff arrives on standard input, so a clipped one is the model's only
 * evidence and it cannot tell a partial diff from a small one. The notice goes
 * in the instruction rather than the body: it is advice about how to read the
 * input, not part of the change, and keeping it out of the body leaves the diff
 * itself byte-for-byte what git produced.
 */
function truncationNotice(truncation: Captured["truncation"]): string {
  if (truncation.kind === "none") {
    return "";
  }

  const { shownLines, totalLines } = truncation;

  return (
    `\n\n[brand-commit: the staged diff is truncated to the first ${shownLines} of ` +
    `${totalLines} lines. You are seeing part of the change, not all of it. ` +
    `Describe the change as a whole, and do not assume these are the only files involved.]`
  );
}

export function commitMessagePrompt(capture: Captured): string {
  return `${PROMPT}${truncationNotice(capture.truncation)}`;
}