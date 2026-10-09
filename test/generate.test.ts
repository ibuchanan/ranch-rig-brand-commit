import { describe, expect, test } from "bun:test";
import {
  GIT_COMMENT_SCAFFOLDING,
  LEFTHOOK_UNFILLED_PLACEHOLDER,
  createTempRepo,
  gitMessageFileContents,
  readMessageFile,
  runHook,
  seedFile,
  writeMessageFile,
} from "./helpers";

describe("a bare git commit", () => {
  test("is committed with the message the model wrote", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const messageFile = await writeMessageFile(repo, gitMessageFileContents());

    const result = await runHook({
      repo,
      messageFile,
      commitSource: LEFTHOOK_UNFILLED_PLACEHOLDER,
      env: { STUB_OUTPUT: "feat(JRA-123): add a" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(await readMessageFile(messageFile)).toBe(
      ["feat(JRA-123): add a", GIT_COMMENT_SCAFFOLDING].join("\n"),
    );
  });

  test("is also a bare commit when the source argument is absent", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const messageFile = await writeMessageFile(repo, gitMessageFileContents());

    const result = await runHook({
      repo,
      messageFile,
      commitSource: null,
      env: { STUB_OUTPUT: "feat(JRA-123): add a" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(await readMessageFile(messageFile)).toBe(
      ["feat(JRA-123): add a", GIT_COMMENT_SCAFFOLDING].join("\n"),
    );
  });
});

describe("what the model is asked to describe", () => {
  test("is the staged change, not the working tree", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    await Bun.write(`${repo}/src/a.txt`, "const a = 2;\n");
    const messageFile = await writeMessageFile(repo, gitMessageFileContents());
    const promptFile = `${repo}/prompt.txt`;

    await runHook({ repo, messageFile, env: { STUB_PROMPT_FILE: promptFile } });

    const recorded = await readMessageFile(promptFile);

    expect(recorded).toContain("+const a = 1;");
    expect(recorded).not.toContain("+const a = 2;");
  });

  test("is described by the organisation's commit skill, not by rules written here", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const messageFile = await writeMessageFile(repo, gitMessageFileContents());
    const promptFile = `${repo}/prompt.txt`;

    await runHook({ repo, messageFile, env: { STUB_PROMPT_FILE: promptFile } });

    const recorded = await readMessageFile(promptFile);

    expect(recorded).toContain("git-commit");
    expect(recorded.toLowerCase()).not.toContain("conventional commit");
  });

  test("is sent to the model the caller asked for", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const messageFile = await writeMessageFile(repo, gitMessageFileContents());
    const promptFile = `${repo}/prompt.txt`;

    await runHook({
      repo,
      messageFile,
      env: { BRAND_COMMIT_MODEL: "claude-sonnet-5", STUB_PROMPT_FILE: promptFile },
    });

    expect(await readMessageFile(promptFile)).toContain("--model\nclaude-sonnet-5\n");
  });
});

describe("a model call that fails", () => {
  test("writes nothing, says why in one line, and aborts", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const untouched = gitMessageFileContents();
    const messageFile = await writeMessageFile(repo, untouched);

    const result = await runHook({ repo, messageFile, env: { STUB_MODE: "fail" } });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(result.stderr).toContain("exited 7");
    expect(result.stderr).not.toContain("rovo: request failed");
    expect(await readMessageFile(messageFile)).toBe(untouched);
  });
});

describe("a hook that runs twice over the same message file", () => {
  test("leaves the message the first run wrote", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const messageFile = await writeMessageFile(repo, gitMessageFileContents());

    await runHook({ repo, messageFile, env: { STUB_OUTPUT: "feat(JRA-123): add a" } });
    const afterFirstRun = await readMessageFile(messageFile);

    const second = await runHook({
      repo,
      messageFile,
      env: { STUB_OUTPUT: "chore(JRA-999): something else entirely" },
    });

    expect(second.exitCode).toBe(0);
    expect(second.stderr).toBe("");
    expect(await readMessageFile(messageFile)).toBe(afterFirstRun);
  });
});
