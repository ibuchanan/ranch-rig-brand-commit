import { decideCommitSource } from "./commit-source";
import { resolve, type Outcome } from "./outcome";
import { hasMessage, withMessage } from "./message-file";
import { requestCommitMessage } from "./model";
import { commitMessagePrompt } from "./prompt";
import { sanitize } from "./sanitize";
import { captureStagedDiff } from "./staged-diff";

export async function generate(
  messageFile: string,
  commitSource: string | undefined,
): Promise<number> {
  const outcome = await decide(messageFile, commitSource);
  const { exitCode, line } = resolve(outcome);

  if (line !== null) {
    process.stderr.write(`${line}\n`);
  }

  if (outcome.kind === "written") {
    await Bun.write(messageFile, outcome.contents);
  }

  return exitCode;
}

async function decide(messageFile: string, commitSource: string | undefined): Promise<Outcome> {
  if (process.env["BRAND_COMMIT_DISABLE"] !== undefined) {
    return { kind: "skip" };
  }

  const decision = decideCommitSource(commitSource);

  if (decision.kind === "skip") {
    return { kind: "skip" };
  }

  if (decision.kind === "unrecognised") {
    return { kind: "aborted", cause: { kind: "unrecognised-source", source: decision.source } };
  }

  const message = Bun.file(messageFile);

  if (!(await message.exists())) {
    return { kind: "aborted", cause: { kind: "unreadable-message-file", path: messageFile } };
  }

  const contents = await message.text();

  if (hasMessage(contents)) {
    return { kind: "skip" };
  }

  const capture = await captureStagedDiff(process.cwd());

  // Two ways to have nothing worth a message, and both are correct answers
  // rather than failures: an empty commit changed nothing, and a commit whose
  // every file was filtered out changed something a message must not describe.
  if (capture.kind === "empty") {
    return { kind: "nothing-to-describe" };
  }

  if (capture.kind === "all-excluded") {
    return { kind: "nothing-to-describe" };
  }

  const answer = await requestCommitMessage(
    process.env["BRAND_COMMIT_MODEL"],
    commitMessagePrompt(capture),
    capture.body,
  );

  if (answer.kind === "failed") {
    return { kind: "aborted", cause: answer.cause };
  }

  const sanitized = sanitize(answer.message);

  if (sanitized.kind === "unusable") {
    return { kind: "aborted", cause: { kind: "unusable-response" } };
  }

  return { kind: "written", contents: withMessage(contents, sanitized.message) };
}