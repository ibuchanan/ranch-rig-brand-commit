import { EXIT_GENERATION_FAILED, EXIT_OK, EXIT_UNKNOWN_SOURCE, EXIT_USAGE } from "./exit-codes";

export type Cause =
  | { kind: "unrecognised-source"; source: string }
  | { kind: "unreadable-message-file"; path: string }
  | { kind: "unreachable"; detail: string }
  | { kind: "timed-out"; afterMs: number }
  | { kind: "model-failed"; exitCode: number }
  | { kind: "unusable-response" };

export type Outcome =
  | { kind: "skip" }
  | { kind: "nothing-to-describe" }
  | { kind: "written"; contents: string }
  | { kind: "aborted"; cause: Cause };

export type Resolution = { exitCode: number; line: string | null };

const PROCEED: Resolution = { exitCode: EXIT_OK, line: null };

/**
 * The one rule that decides a commit's fate: doing nothing is only correct, and
 * only exit zero, when there was nothing to write. Every outcome that leaves a
 * commit without the message it asked for aborts it and says which cause it was,
 * because the remedy differs — wait and retry, fix the prompt, or fix the hook.
 */
export function resolve(outcome: Outcome): Resolution {
  switch (outcome.kind) {
    case "skip":
    case "nothing-to-describe":
    case "written":
      return PROCEED;

    case "aborted":
      return abort(outcome.cause);
  }
}

function abort(cause: Cause): Resolution {
  switch (cause.kind) {
    case "unrecognised-source":
      return {
        exitCode: EXIT_UNKNOWN_SOURCE,
        line: `brand-commit: unrecognised commit source "${cause.source}"; aborting the commit`,
      };

    case "unreadable-message-file":
      return {
        exitCode: EXIT_USAGE,
        line: `brand-commit: the message file ${cause.path} cannot be read; check the hook configuration`,
      };

    case "unreachable":
      return {
        exitCode: EXIT_GENERATION_FAILED,
        line: `brand-commit: the model could not be reached (${cause.detail}); aborting the commit`,
      };

    case "timed-out":
      return {
        exitCode: EXIT_GENERATION_FAILED,
        line: `brand-commit: the model timed out after ${cause.afterMs}ms; aborting the commit`,
      };

    case "model-failed":
      return {
        exitCode: EXIT_GENERATION_FAILED,
        line: `brand-commit: the model command exited ${cause.exitCode}; aborting the commit`,
      };

    case "unusable-response":
      return {
        exitCode: EXIT_GENERATION_FAILED,
        line: `brand-commit: the model returned no usable message; aborting the commit`,
      };
  }
}
