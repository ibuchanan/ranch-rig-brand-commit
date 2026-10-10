import { describe, expect, test } from "bun:test";
import { join } from "node:path";
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
  writeMessageFile,
} from "./helpers";

const SIDECAR_NAME = "brand-commit-ticket";

function sidecarPath(repo: string): string {
  return join(repo, ".git", SIDECAR_NAME);
}

async function writeSidecar(repo: string, key: string): Promise<void> {
  await Bun.write(sidecarPath(repo), `${key}\n`);
}

async function sidecarExists(repo: string): Promise<boolean> {
  return await Bun.file(sidecarPath(repo)).exists();
}

async function commit(repo: string, env: Record<string, string> = {}): Promise<void> {
  await git(repo, ["commit", "--quiet"], commitEnvironment(env));
}

describe("a ticket key set inline on the same call as git commit", () => {
  test("reaches the model as context", async () => {
    const repo = await createTempRepo();
    await installPrepareCommitMsgHook(repo);
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const promptFile = `${repo}/prompt.txt`;

    await commit(repo, { STUB_PROMPT_FILE: promptFile, BRAND_COMMIT_TICKET: "JRA-303" });

    const prompt = await readMessageFile(promptFile);

    expect(prompt).toContain("JRA-303");
    expect(prompt).toContain("git-commit skill");
  });

  test("reaches the model as context the caller decides, not as a placement rule", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const messageFile = await writeMessageFile(repo, gitMessageFileContents());
    const promptFile = `${repo}/prompt.txt`;

    await runHook({
      repo,
      messageFile,
      env: { STUB_PROMPT_FILE: promptFile, BRAND_COMMIT_TICKET: "JRA-303" },
    });

    const prompt = await readMessageFile(promptFile);

    expect(prompt).toContain("JRA-303");
    expect(prompt.toLowerCase()).not.toContain("first line");
    expect(prompt.toLowerCase()).not.toContain("prefix");
    expect(prompt).toContain("git-commit skill");
  });
});

describe("a ticket key exported in a shell the tool never inherits", () => {
  test("does not reach the model", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const messageFile = await writeMessageFile(repo, gitMessageFileContents());
    const promptFile = `${repo}/prompt.txt`;

    // One Bash call sets the variable; the next one is a different shell.
    await Bun.spawn(["sh", "-c", "export BRAND_COMMIT_TICKET=JRA-999"], {
      cwd: repo,
      stdout: "pipe",
      stderr: "pipe",
    }).exited;

    const result = await runHook({ repo, messageFile, env: { STUB_PROMPT_FILE: promptFile } });

    expect(result.exitCode).toBe(0);
    expect(await readMessageFile(promptFile)).not.toContain("JRA-999");
  });
});

describe("a ticket key in a sidecar file under .git", () => {
  test("reaches the model and is gone once it has been used", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const messageFile = await writeMessageFile(repo, gitMessageFileContents());
    const promptFile = `${repo}/prompt.txt`;
    await writeSidecar(repo, "JRA-404");

    const result = await runHook({ repo, messageFile, env: { STUB_PROMPT_FILE: promptFile } });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(await readMessageFile(promptFile)).toContain("JRA-404");
    expect(await sidecarExists(repo)).toBe(false);
  });

  test("never reaches the commit it was written for twice", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    await writeSidecar(repo, "JRA-404");
    const firstPrompt = `${repo}/first-prompt.txt`;
    const secondPrompt = `${repo}/second-prompt.txt`;

    await runHook({
      repo,
      messageFile: await writeMessageFile(repo, gitMessageFileContents()),
      env: { STUB_PROMPT_FILE: firstPrompt },
    });
    await runHook({
      repo,
      messageFile: await writeMessageFile(repo, gitMessageFileContents()),
      env: { STUB_PROMPT_FILE: secondPrompt },
    });

    expect(await readMessageFile(firstPrompt)).toContain("JRA-404");
    expect(await readMessageFile(secondPrompt)).not.toContain("JRA-404");
  });

  test("does not survive the commit it was written for being abandoned", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const promptFile = `${repo}/prompt.txt`;
    await writeSidecar(repo, "JRA-404");

    const abandoned = await runHook({
      repo,
      messageFile: await writeMessageFile(repo, gitMessageFileContents()),
      env: { STUB_MODE: "fail" },
    });
    const next = await runHook({
      repo,
      messageFile: await writeMessageFile(repo, gitMessageFileContents()),
      env: { STUB_PROMPT_FILE: promptFile },
    });

    expect(abandoned.exitCode).not.toBe(0);
    expect(next.exitCode).toBe(0);
    expect(next.stderr).toBe("");
    expect(await readMessageFile(promptFile)).not.toContain("JRA-404");
  });

  test("is never tracked, so it cannot leak into a commit", async () => {
    const repo = await createTempRepo();
    await installPrepareCommitMsgHook(repo);
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    await writeSidecar(repo, "JRA-404");

    await commit(repo);

    const tracked = await gitOrThrow(repo, ["ls-files"]);
    const committed = await gitOrThrow(repo, ["show", "--name-only", "--format=", "HEAD"]);

    expect(tracked.stdout).not.toContain(SIDECAR_NAME);
    expect(committed.stdout).not.toContain(SIDECAR_NAME);
    expect(tracked.stdout.trim()).toBe("src/a.txt");
  });

test("is reported as suspect when a commit it was not used by has landed since", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    await gitOrThrow(repo, ["commit", "--quiet", "-m", "chore(JRA-404): the first"]);
    await seedFile(repo, "src/b.txt", "const b = 2;\n");
    await writeSidecar(repo, "JRA-404");

    // The key is written after the last commit but before this one, so the two
    // commits cannot be told apart in whole seconds and the key reads as
    // current. Wait past a second boundary to reach the case where it did
    // outlive a commit: the tool must report the key, not attribute it silently.
    await Bun.sleep(1100);
    await gitOrThrow(repo, ["commit", "--quiet", "-m", "chore(JRA-404): the second"]);
    await seedFile(repo, "src/c.txt", "const c = 3;\n");
    const promptFile = `${repo}/prompt.txt`;

    const result = await runHook({
      repo,
      messageFile: await writeMessageFile(repo, gitMessageFileContents()),
      env: { STUB_PROMPT_FILE: promptFile },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("JRA-404");
    expect(await readMessageFile(promptFile)).toContain("JRA-404");
    expect(await sidecarExists(repo)).toBe(false);
  });
});

describe("a commit with no ticket key on either channel", () => {
  test("is described without one and goes ahead", async () => {
    const repo = await createTempRepo();
    await installPrepareCommitMsgHook(repo);
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const promptFile = `${repo}/prompt.txt`;

    await commit(repo, { STUB_PROMPT_FILE: promptFile });

    const prompt = await readMessageFile(promptFile);

    expect(prompt).not.toContain("ticket");
    expect((await gitOrThrow(repo, ["log", "-1", "--format=%s"])).stdout.trim()).toBe(
      "feat(JRA-000): canned subject from the stub",
    );
  });

  test("leaves no scratch state behind for the next commit to find", async () => {
    const repo = await createTempRepo();
    await installPrepareCommitMsgHook(repo);
    await seedFile(repo, "src/a.txt", "const a = 1;\n");

    await commit(repo);

    expect(await sidecarExists(repo)).toBe(false);
  });
});