import type { Capture } from "./staged-diff";
import type { TicketKey } from "./ticket";

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

/**
 * The key is supplied, never prescribed. This tool does not own the subject
 * format, so it states what the key is and leaves placement to the git-commit
 * skill; wording it as a rule here would put format policy in a second place,
 * where it could disagree with the skill and never be updated with it.
 *
 * A suspect key is marked as such because a key that survived an abandoned
 * commit is more likely to be wrong than right, and the model is the only party
 * that has seen the diff and can tell whether the key belongs to it.
 */
function ticketNotice(ticket: TicketKey): string {
  if (ticket.kind === "none") {
    return "";
  }

  const suspicion = ticket.suspect
    ? " It was written before an earlier commit and may not belong to this change: " +
      "use it only if the change below is the work that ticket describes."
    : "";

  return (
    `\n\n[brand-commit: the ticket key for this change is ${ticket.value}.` +
    ` The git-commit skill decides whether and where it appears in the message.${suspicion}]`
  );
}

export function commitMessagePrompt(capture: Captured, ticket: TicketKey): string {
  return `${PROMPT}${ticketNotice(ticket)}${truncationNotice(capture.truncation)}`;
}
