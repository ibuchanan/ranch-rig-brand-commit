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

describe("a commit source the tool does not recognise", () => {
  test("is refused rather than guessed at, and nothing is written", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const untouched = gitMessageFileContents();
    const messageFile = await writeMessageFile(repo, untouched);

    const result = await runHook({
      repo,
      messageFile,
      commitSource: "HEAD",
      env: { STUB_OUTPUT: "feat(JRA-123): must never reach the message file" },
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(result.stderr).toContain("unrecognised commit source");
    expect(result.stderr).toContain("HEAD");
    expect(await readMessageFile(messageFile)).toBe(untouched);
  });
});

describe.each([
  ["message", "a message given with -m or -F"],
  ["template", "a message read from a -t template"],
  ["merge", "a merge git is about to record"],
  ["squash", "a squash git synthesised a message for"],
  ["commit", "an amend reusing the existing commit message"],
])("a commit source meaning %s", (source, meaning) => {
  test(`stops the tool before it reaches the model for ${meaning}`, async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const untouched = gitMessageFileContents();
    const messageFile = await writeMessageFile(repo, untouched);

    const result = await runHook({
      repo,
      messageFile,
      commitSource: source,
      env: { STUB_MODE: "fail" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(await readMessageFile(messageFile)).toBe(untouched);
  });
});

describe("a commit message the developer supplied", () => {
  test("given with -m is committed as written, even while the model is broken", async () => {
    const repo = await createTempRepo();
    await installPrepareCommitMsgHook(repo);
    await seedFile(repo, "src/a.txt", "const a = 1;\n");

    const commit = await git(
      repo,
      ["commit", "--quiet", "-m", "chore(JRA-1): written by the developer"],
      commitEnvironment({ STUB_MODE: "fail" }),
    );

    expect(commit.exitCode).toBe(0);
    expect((await gitOrThrow(repo, ["log", "-1", "--format=%s"])).stdout.trim()).toBe(
      "chore(JRA-1): written by the developer",
    );
  });

  test("read from a file with -F is committed as written", async () => {
    const repo = await createTempRepo();
    await installPrepareCommitMsgHook(repo);
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    await Bun.write(`${repo}/from-file.txt`, "chore(JRA-2): read from a file\n");

    const commit = await git(
      repo,
      ["commit", "--quiet", "-F", "from-file.txt"],
      commitEnvironment({ STUB_MODE: "fail" }),
    );

    expect(commit.exitCode).toBe(0);
    expect((await gitOrThrow(repo, ["log", "-1", "--format=%s"])).stdout.trim()).toBe(
      "chore(JRA-2): read from a file",
    );
  });

  test("supplied as a -t template is left in place", async () => {
    const repo = await createTempRepo();
    await installPrepareCommitMsgHook(repo);
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    await Bun.write(`${repo}/template.txt`, "chore(JRA-3): from the template\n");
    const editor = await writeEditingEditor(repo);

    const commit = await git(
      repo,
      ["commit", "--quiet", "-t", "template.txt"],
      commitEnvironment({ GIT_EDITOR: editor, STUB_MODE: "fail" }),
    );

    expect(commit.exitCode).toBe(0);
    expect((await gitOrThrow(repo, ["log", "-1", "--format=%s"])).stdout.trim()).toBe(
      "chore(JRA-3): from the template",
    );
  });
});

describe("the two rows git reports as message when you would not expect it to", () => {
  test("an amend given -m commits that message and does not add a commit", async () => {
    const repo = await createTempRepo();
    await installPrepareCommitMsgHook(repo);
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    await gitOrThrow(
      repo,
      ["commit", "--quiet", "-m", "chore(JRA-4): the original"],
      commitEnvironment(),
    );

    const amend = await git(
      repo,
      ["commit", "--quiet", "--amend", "-m", "fix(JRA-4): the replacement"],
      commitEnvironment({ STUB_MODE: "fail" }),
    );

    expect(amend.exitCode).toBe(0);
    expect((await gitOrThrow(repo, ["log", "-1", "--format=%s"])).stdout.trim()).toBe(
      "fix(JRA-4): the replacement",
    );
    expect((await gitOrThrow(repo, ["rev-list", "--count", "HEAD"])).stdout.trim()).toBe("1");
  });

  test("a template combined with -m commits the -m message", async () => {
    const repo = await createTempRepo();
    await installPrepareCommitMsgHook(repo);
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    await Bun.write(`${repo}/template.txt`, "chore(JRA-5): from the template\n");
    const editor = await writeEditingEditor(repo);

    const commit = await git(
      repo,
      ["commit", "--quiet", "-t", "template.txt", "-m", "fix(JRA-5): -m wins"],
      commitEnvironment({ GIT_EDITOR: editor, STUB_MODE: "fail" }),
    );

    expect(commit.exitCode).toBe(0);
    expect((await gitOrThrow(repo, ["log", "-1", "--format=%s"])).stdout.trim()).toBe(
      "fix(JRA-5): -m wins",
    );
  });
});

describe("an amend that reuses the existing message", () => {
  test("keeps the original message and the original author", async () => {
    const repo = await createTempRepo();
    await installPrepareCommitMsgHook(repo);
    await seedFile(repo, "src/a.txt", "const a = 1;\n");

    await gitOrThrow(
      repo,
      ["commit", "--quiet", "-m", "chore(JRA-6): the original subject"],
      commitEnvironment({
        GIT_AUTHOR_NAME: "original author",
        GIT_AUTHOR_EMAIL: "original@example.invalid",
        GIT_COMMITTER_NAME: "original committer",
        GIT_COMMITTER_EMAIL: "original-committer@example.invalid",
      }),
    );

    const amend = await git(repo, ["commit", "--quiet", "--amend"], {
      ...commitEnvironment({ STUB_MODE: "fail" }),
      GIT_AUTHOR_NAME: "amender",
      GIT_AUTHOR_EMAIL: "amender@example.invalid",
      GIT_COMMITTER_NAME: "amender",
      GIT_COMMITTER_EMAIL: "amender@example.invalid",
    });

    expect(amend.exitCode).toBe(0);

    const log = await gitOrThrow(repo, ["log", "-1", "--format=%s%n%an <%ae>%n%cn <%ce>"]);

    expect(log.stdout.trim().split("\n")).toEqual([
      "chore(JRA-6): the original subject",
      "original author <original@example.invalid>",
      "amender <amender@example.invalid>",
    ]);
  });
});

describe("a merge", () => {
  test("commits the merge message git generated for it", async () => {
    const repo = await createTempRepo();
    await installPrepareCommitMsgHook(repo);
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    await gitOrThrow(
      repo,
      ["commit", "--quiet", "-m", "chore(JRA-7): the base"],
      commitEnvironment(),
    );

    await gitOrThrow(repo, ["checkout", "--quiet", "-b", "side"]);
    await seedFile(repo, "src/side.txt", "side\n");
    await gitOrThrow(
      repo,
      ["commit", "--quiet", "-m", "feat(JRA-7): side work"],
      commitEnvironment(),
    );

    await gitOrThrow(repo, ["checkout", "--quiet", "main"]);
    await seedFile(repo, "src/main.txt", "main\n");
    await gitOrThrow(
      repo,
      ["commit", "--quiet", "-m", "feat(JRA-7): main work"],
      commitEnvironment(),
    );

    const merge = await git(
      repo,
      ["merge", "--quiet", "--no-ff", "side"],
      commitEnvironment({ STUB_MODE: "fail" }),
    );

    expect(merge.exitCode).toBe(0);
    expect((await gitOrThrow(repo, ["log", "-1", "--format=%s"])).stdout.trim()).toBe(
      "Merge branch 'side'",
    );
  });
});

describe("a commit with nothing staged", () => {
  test("is not mistaken for a commit source the tool does not know", async () => {
    const repo = await createTempRepo();
    await installPrepareCommitMsgHook(repo);
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    await gitOrThrow(
      repo,
      ["commit", "--quiet", "-m", "chore(JRA-8): the base"],
      commitEnvironment(),
    );
    await gitOrThrow(repo, ["reset", "--hard", "--quiet", "HEAD"]);

    const empty = await git(repo, ["commit", "--quiet", "--allow-empty"], {
      ...commitEnvironment(),
      STUB_OUTPUT: "chore(JRA-8): nothing was staged",
    });

    expect(empty.exitCode).toBe(0);
    expect(empty.stderr).not.toContain("unrecognised commit source");
    expect((await gitOrThrow(repo, ["rev-list", "--count", "HEAD"])).stdout.trim()).toBe("2");
  });
});
