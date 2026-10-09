import { describe, expect, test } from "bun:test";
import {
  commitEnvironment,
  createTempRepo,
  git,
  gitMessageFileContents,
  gitOrThrow,
  installPrepareCommitMsgHook,
  readMessageFile,
  runHook,
  seedFile,
  writeEditingEditor,
  writeMessageFile,
} from "./helpers";

describe("a model that exits cleanly but answers with nothing", () => {
  test("is reported as an unusable response rather than a good one", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const untouched = gitMessageFileContents();
    const messageFile = await writeMessageFile(repo, untouched);

    const result = await runHook({ repo, messageFile, env: { STUB_MODE: "empty" } });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("returned no usable message");
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(await readMessageFile(messageFile)).toBe(untouched);
  });

  test("answers with whitespace only are unusable too", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const untouched = gitMessageFileContents();
    const messageFile = await writeMessageFile(repo, untouched);

    const result = await runHook({
      repo,
      messageFile,
      env: { STUB_MODE: "empty", STUB_OUTPUT: "   \n\t\n" },
    });

    expect(result.exitCode).toBe(1);
    expect(await readMessageFile(messageFile)).toBe(untouched);
  });
});

describe.each([
  ["the model command exits non-zero", { STUB_MODE: "fail" }, "exited 7"],
  ["the model never answers", { STUB_MODE: "hang", BRAND_COMMIT_TIMEOUT_MS: "500" }, "timed out"],
  ["the model returns nothing usable", { STUB_MODE: "empty" }, "no usable message"],
])("a bare git commit while %s", (_case, env, cause) => {
  test("is abandoned, recording no commit and leaving the change staged", async () => {
    const repo = await createTempRepo();
    await installPrepareCommitMsgHook(repo);
    await seedFile(repo, "src/a.txt", "const a = 1;\n");

    const commit = await git(repo, ["commit", "--quiet"], commitEnvironment(env));

    expect(commit.exitCode).not.toBe(0);
    expect(commit.stderr.trim().split("\n").filter((line) => line.includes("brand-commit:")))
      .toHaveLength(1);
    expect(commit.stderr).toContain(cause);
    expect((await gitOrThrow(repo, ["rev-list", "--count", "--all"])).stdout.trim()).toBe("0");
    expect((await gitOrThrow(repo, ["diff", "--cached", "--name-only"])).stdout.trim()).toBe(
      "src/a.txt",
    );
  });
});

describe("BRAND_COMMIT_DISABLE", () => {
  test("skips the tool entirely and leaves the message file alone", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const untouched = gitMessageFileContents();
    const messageFile = await writeMessageFile(repo, untouched);
    const promptFile = `${repo}/prompt.txt`;

    const result = await runHook({
      repo,
      messageFile,
      env: { STUB_MODE: "fail", STUB_PROMPT_FILE: promptFile, BRAND_COMMIT_DISABLE: "1" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(await Bun.file(promptFile).exists()).toBe(false);
    expect(await readMessageFile(messageFile)).toBe(untouched);
  });

  test("lets a bare commit land while the model always fails", async () => {
    const repo = await createTempRepo();
    await installPrepareCommitMsgHook(repo);
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const editor = await writeEditingEditor(repo);

    const commit = await git(repo, ["commit", "--quiet"], {
      ...commitEnvironment({ STUB_MODE: "fail" }),
      GIT_EDITOR: editor,
      BRAND_COMMIT_DISABLE: "1",
    });

    expect(commit.exitCode).toBe(0);
    expect((await gitOrThrow(repo, ["log", "-1", "--format=%s"])).stdout.trim()).toBe(
      "Edited by the test harness",
    );
  });
});

describe("a commit with nothing staged", () => {
  test("asks the model for nothing and leaves the message file alone", async () => {
    const repo = await createTempRepo();
    const untouched = gitMessageFileContents();
    const messageFile = await writeMessageFile(repo, untouched);
    const promptFile = `${repo}/prompt.txt`;

    const result = await runHook({
      repo,
      messageFile,
      env: { STUB_OUTPUT: "chore(JRA-1): invented from nothing", STUB_PROMPT_FILE: promptFile },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(await Bun.file(promptFile).exists()).toBe(false);
    expect(await readMessageFile(messageFile)).toBe(untouched);
  });
});

describe("a message file git never supplied", () => {
  test("is reported as a misconfiguration, on one line, with no stack trace", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const missing = `${repo}/.git/NOT_SUPPLIED`;

    const result = await runHook({ repo, messageFile: missing });

    expect(result.exitCode).toBe(2);
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(result.stderr).toContain("message file");
    expect(result.stderr).not.toMatch(/\n\s+at /);
  });
});

describe("a model command that is not installed", () => {
  test("is reported as unreachable, on one line, with no stack trace", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const untouched = gitMessageFileContents();
    const messageFile = await writeMessageFile(repo, untouched);

    const result = await runHook({ repo, messageFile, env: { PATH: "/usr/bin:/bin" } });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(result.stderr).toContain("could not be reached");
    expect(result.stderr).not.toMatch(/\n\s+at /);
    expect(await readMessageFile(messageFile)).toBe(untouched);
  });
});

describe("a model that never answers", () => {
  test("is reported as a timeout, distinctly from a model that exited", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const untouched = gitMessageFileContents();
    const messageFile = await writeMessageFile(repo, untouched);

    const result = await runHook({
      repo,
      messageFile,
      env: { STUB_MODE: "hang", BRAND_COMMIT_TIMEOUT_MS: "500" },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(result.stderr).toContain("timed out");
    expect(result.stderr).not.toContain("exited");
    expect(await readMessageFile(messageFile)).toBe(untouched);
  });

  test("is not a timeout when the answer arrives inside the deadline", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const messageFile = await writeMessageFile(repo, gitMessageFileContents());

    const result = await runHook({
      repo,
      messageFile,
      env: { STUB_OUTPUT: "feat(JRA-123): in time", BRAND_COMMIT_TIMEOUT_MS: "30000" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(await readMessageFile(messageFile)).toContain("feat(JRA-123): in time");
  });
});
