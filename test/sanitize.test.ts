import { describe, expect, test } from "bun:test";
import {
  GIT_COMMENT_SCAFFOLDING,
  createTempRepo,
  readMessageFile,
  runHook,
  seedFile,
  writeMessageFile,
} from "./helpers";

describe("a model that wraps its answer in a code fence", () => {
  test("has the fence and its opening info-string removed, leaving the message", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const messageFile = await writeMessageFile(repo, GIT_COMMENT_SCAFFOLDING);

    const result = await runHook({
      repo,
      messageFile,
      env: { STUB_OUTPUT: "```text\nfeat(JRA-123): add a\n```" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(await readMessageFile(messageFile)).toBe(
      ["feat(JRA-123): add a", GIT_COMMENT_SCAFFOLDING].join("\n"),
    );
  });
});

describe("a model that quotes its whole answer", () => {
  test("is unwrapped, leaving the message", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const messageFile = await writeMessageFile(repo, GIT_COMMENT_SCAFFOLDING);

    const result = await runHook({
      repo,
      messageFile,
      env: { STUB_OUTPUT: '"feat(JRA-123): add a"' },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(await readMessageFile(messageFile)).toBe(
      ["feat(JRA-123): add a", GIT_COMMENT_SCAFFOLDING].join("\n"),
    );
  });
});

describe("a model that introduces its answer", () => {
  test("has the conversational preamble removed, leaving the message", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const messageFile = await writeMessageFile(repo, GIT_COMMENT_SCAFFOLDING);

    const result = await runHook({
      repo,
      messageFile,
      env: { STUB_OUTPUT: "Here is the commit message:\nfeat(JRA-123): add a" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(await readMessageFile(messageFile)).toBe(
      ["feat(JRA-123): add a", GIT_COMMENT_SCAFFOLDING].join("\n"),
    );
  });
});

describe("a model that quotes a fenced block", () => {
  test("has both wrappings removed, leaving no fence behind", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const messageFile = await writeMessageFile(repo, GIT_COMMENT_SCAFFOLDING);

    const result = await runHook({
      repo,
      messageFile,
      env: { STUB_OUTPUT: '"```text\nfeat(JRA-123): add a\n```"' },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(await readMessageFile(messageFile)).toBe(
      ["feat(JRA-123): add a", GIT_COMMENT_SCAFFOLDING].join("\n"),
    );
  });
});

describe("a model whose answer has a fence unwrapping cannot reach", () => {
  test("is rejected rather than written with the fence still in it", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const untouched = GIT_COMMENT_SCAFFOLDING;
    const messageFile = await writeMessageFile(repo, untouched);

    const result = await runHook({
      repo,
      messageFile,
      env: { STUB_OUTPUT: "feat(JRA-123): add a\n```\nchore: unrelated trailing content" },
    });

    expect(result.exitCode).toBe(1);
    expect(await readMessageFile(messageFile)).toBe(untouched);
  });
});

describe("a model that answers with an implausibly long response", () => {
  test("is rejected rather than written", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const untouched = GIT_COMMENT_SCAFFOLDING;
    const messageFile = await writeMessageFile(repo, untouched);

    const result = await runHook({
      repo,
      messageFile,
      env: { STUB_OUTPUT: `feat(JRA-123): add a\n\n${"x".repeat(5000)}` },
    });

    expect(result.exitCode).toBe(1);
    expect(await readMessageFile(messageFile)).toBe(untouched);
  });

  test("one comfortably inside the ceiling is still written", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const messageFile = await writeMessageFile(repo, GIT_COMMENT_SCAFFOLDING);

    const result = await runHook({
      repo,
      messageFile,
      env: { STUB_OUTPUT: `feat(JRA-123): add a\n\n${"x".repeat(500)}` },
    });

    expect(result.exitCode).toBe(0);
    expect(await readMessageFile(messageFile)).toContain("feat(JRA-123): add a");
  });
});

describe("a rejection", () => {
  test("says why on a single line and names the model as the cause", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const untouched = GIT_COMMENT_SCAFFOLDING;
    const messageFile = await writeMessageFile(repo, untouched);

    const result = await runHook({
      repo,
      messageFile,
      env: { STUB_OUTPUT: "feat(JRA-123): add a\n```\nchore: trailing" },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(result.stderr).toContain("no usable message");
    expect(result.stderr).not.toMatch(/\n\s+at /);
    expect(result.stderr).not.toContain("```");
  });
});

describe("a subject that follows no convention at all", () => {
  test("passes through unmodified, because format rules are the commit skill's job", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const messageFile = await writeMessageFile(repo, GIT_COMMENT_SCAFFOLDING);
    const subject = "Make the thing work when the other thing is on fire";

    const result = await runHook({ repo, messageFile, env: { STUB_OUTPUT: subject } });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(await readMessageFile(messageFile)).toBe(
      [subject, GIT_COMMENT_SCAFFOLDING].join("\n"),
    );
  });
});

describe("the same wrapping delivered with and without line breaks", () => {
  const shapes = [
    ["on one line", "Here is the commit message: feat(JRA-123): add a"],
    ["across two lines", "Here is the commit message:\nfeat(JRA-123): add a"],
  ] as const;

  test.each(shapes)("is cleaned to the same message when the preamble sits %s", async (
    _shape,
    response,
  ) => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/a.txt", "const a = 1;\n");
    const messageFile = await writeMessageFile(repo, GIT_COMMENT_SCAFFOLDING);

    const result = await runHook({ repo, messageFile, env: { STUB_OUTPUT: response } });

    expect(result.exitCode).toBe(0);
    expect(await readMessageFile(messageFile)).toBe(
      ["feat(JRA-123): add a", GIT_COMMENT_SCAFFOLDING].join("\n"),
    );
  });
});