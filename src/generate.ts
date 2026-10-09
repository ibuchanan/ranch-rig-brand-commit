import { isBareCommit } from "./commit-source";
import { EXIT_GENERATION_FAILED, EXIT_OK } from "./exit-codes";
import { requestCommitMessage } from "./model";
import { hasMessage, withMessage } from "./message-file";
import { PROMPT } from "./prompt";
import { stagedDiff } from "./staged-diff";

export async function generate(
  messageFile: string,
  commitSource: string | undefined,
): Promise<number> {
  if (!isBareCommit(commitSource)) {
    return EXIT_OK;
  }

  const contents = await Bun.file(messageFile).text();

  if (hasMessage(contents)) {
    return EXIT_OK;
  }

  const diff = await stagedDiff(process.cwd());
  const response = await requestCommitMessage(process.env["BRAND_COMMIT_MODEL"], PROMPT, diff);

  if (!response.ok) {
    process.stderr.write(`brand-commit: no message written; ${response.cause}\n`);
    return EXIT_GENERATION_FAILED;
  }

  await Bun.write(messageFile, withMessage(contents, response.message));

  return EXIT_OK;
}
