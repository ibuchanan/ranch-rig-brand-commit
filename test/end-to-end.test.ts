import { describe, expect, test } from "bun:test";
import {
  commitEnvironment,
  createTempRepo,
  git,
  gitOrThrow,
  installPrepareCommitMsgHook,
  seedFile,
} from "./helpers";

describe("a bare git commit in a repository with the hook installed", () => {
  test("is recorded with the message the model wrote", async () => {
    const repo = await createTempRepo();
    await installPrepareCommitMsgHook(repo);
    await seedFile(repo, "src/a.txt", "const a = 1;\n");

    const commit = await git(
      repo,
      ["commit", "--quiet"],
      commitEnvironment({ STUB_OUTPUT: "feat(JRA-123): add a" }),
    );
    const subject = await gitOrThrow(repo, ["log", "-1", "--format=%s"]);

    expect(commit.exitCode).toBe(0);
    expect(subject.stdout.trim()).toBe("feat(JRA-123): add a");
  });
});
