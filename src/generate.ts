import { join } from "node:path";
import { decideCommitSource } from "./commit-source";
import { resolve, type Outcome } from "./outcome";
import { hasMessage, withMessage } from "./message-file";
import { requestCommitMessage } from "./model";
import { commitMessagePrompt } from "./prompt";
import { sanitize } from "./sanitize";
import { captureStagedDiff } from "./staged-diff";
import { SIDECAR_NAME, TICKET_ENV, ticketKeyFor, type TicketKey } from "./ticket";

/**
 * What a run decided, and anything it needs to say that is not part of that
 * decision. A suspect ticket key is a warning about the commit rather than a
 * verdict on it, so it travels beside the outcome instead of inside it and is
 * written to stderr without disturbing the exit code.
 */
type Decision = { outcome: Outcome; warning: string | null };

export async function generate(
  messageFile: string,
  commitSource: string | undefined,
): Promise<number> {
  const { outcome, warning } = await decide(messageFile, commitSource);
  const { exitCode, line } = resolve(outcome);

  if (line !== null) {
    process.stderr.write(`${line}\n`);
  }

  if (warning !== null) {
    process.stderr.write(`${warning}\n`);
  }

  if (outcome.kind === "written") {
    await Bun.write(messageFile, outcome.contents);
  }

  return exitCode;
}

function decideNothing(outcome: Outcome): Decision {
  return { outcome, warning: null };
}

async function decide(messageFile: string, commitSource: string | undefined): Promise<Decision> {
  if (process.env["BRAND_COMMIT_DISABLE"] !== undefined) {
    return decideNothing({ kind: "skip" });
  }

  const decision = decideCommitSource(commitSource);

  if (decision.kind === "skip") {
    return decideNothing({ kind: "skip" });
  }

  if (decision.kind === "unrecognised") {
    return decideNothing({
      kind: "aborted",
      cause: { kind: "unrecognised-source", source: decision.source },
    });
  }

  const message = Bun.file(messageFile);

  if (!(await message.exists())) {
    return decideNothing({
      kind: "aborted",
      cause: { kind: "unreadable-message-file", path: messageFile },
    });
  }

  const contents = await message.text();

  if (hasMessage(contents)) {
    return decideNothing({ kind: "skip" });
  }

  const capture = await captureStagedDiff(process.cwd());

  // Two ways to have nothing worth a message, and both are correct answers
  // rather than failures: an empty commit changed nothing, and a commit whose
  // every file was filtered out changed something a message must not describe.
  if (capture.kind === "empty" || capture.kind === "all-excluded") {
    return decideNothing({ kind: "nothing-to-describe" });
  }

  const ticket = await ticketKeyFor(process.cwd());

  const answer = await requestCommitMessage(
    process.env["BRAND_COMMIT_MODEL"],
    commitMessagePrompt(capture, ticket),
    capture.body,
  );

  const warning = staleTicketWarning(ticket);

  if (answer.kind === "failed") {
    return { outcome: { kind: "aborted", cause: answer.cause }, warning };
  }

  const sanitized = sanitize(answer.message);

  if (sanitized.kind === "unusable") {
    return { outcome: { kind: "aborted", cause: { kind: "unusable-response" } }, warning };
  }

  return {
    outcome: { kind: "written", contents: withMessage(contents, sanitized.message) },
    warning,
  };
}

function staleTicketWarning(ticket: TicketKey): string | null {
  if (ticket.kind !== "key" || !ticket.suspect) {
    return null;
  }

  return (
    `brand-commit: warning: ticket key ${ticket.value} was left behind by an earlier commit ` +
    `and may not describe this change; delete ${join(process.cwd(), ".git", SIDECAR_NAME)} ` +
    `or set ${TICKET_ENV} on this commit to be sure`
  );
}
