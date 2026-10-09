import { SKIP_SOURCES } from "./commit-source";
import { EXIT_GENERATION_FAILED, EXIT_OK, EXIT_UNKNOWN_SOURCE, EXIT_USAGE } from "./exit-codes";
import { generate } from "./generate";
import { VERSION } from "./version";

export { EXIT_GENERATION_FAILED, EXIT_OK, EXIT_UNKNOWN_SOURCE, EXIT_USAGE };

const USAGE = `brand-commit ${VERSION}

Usage:
  brand-commit [options] <message-file> [<commit-source>]

Options:
  -h, --help       Print this contract and exit.
  -V, --version    Print the version and exit.

Arguments:
  <message-file>       Path git passed for the commit message to populate.
  <commit-source>      Commit source git passed. The literal {2} that lefthook
                        substitutes for an absent argument means git supplied
                        none. One of ${SKIP_SOURCES.join(", ")} means a
                        message already exists and is left alone. Any other
                        value is refused, because guessing is how commits get
                        corrupted.

Environment:
  BRAND_COMMIT_DISABLE     Set to any value to leave the commit message alone.
  BRAND_COMMIT_TICKET      Ticket key to hand the model as context.
  BRAND_COMMIT_MODEL       Model identifier to request from rovo.
  BRAND_COMMIT_SOURCE      Overrides <commit-source> detection.
  BRAND_COMMIT_TIMEOUT_MS  Milliseconds to wait for the model before giving up.
                           Defaults to 30000.

Exit codes:
  ${EXIT_OK}  Nothing to do, or a message was written.
  ${EXIT_USAGE}  Usage error; the message file is not readable.
  ${EXIT_GENERATION_FAILED}  A message was asked for and could not be produced; the
     commit is aborted. The cause is named on one line of stderr, because the
     remedy differs between an unreachable model, a timeout, a model that
     exited non-zero, and a response that was unusable.
  ${EXIT_UNKNOWN_SOURCE}  Git reported a commit source this build does not know; the
     commit is aborted rather than guessed at.
`;

export function usage(): string {
  return USAGE;
}

export async function run(argv: string[]): Promise<number> {
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(USAGE);
    return EXIT_OK;
  }

  if (argv.includes("-V") || argv.includes("--version")) {
    process.stdout.write(`${VERSION}\n`);
    return EXIT_OK;
  }

  const positional = argv.filter((arg) => !arg.startsWith("-"));

  if (positional.length === 0) {
    process.stderr.write(`brand-commit: missing <message-file>\n\n${USAGE}`);
    return EXIT_USAGE;
  }

  const [messageFile, commitSource] = positional;

  return generate(messageFile ?? "", commitSource);
}
