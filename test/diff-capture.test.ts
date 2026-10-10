import { describe, expect, test } from "bun:test";
import {
  createTempRepo,
  gitMessageFileContents,
  readMessageFile,
  runHook,
  seedBinaryFile,
  seedFile,
  writeMessageFile,
} from "./helpers";

describe("what the model is asked to describe", () => {
  test("is the source change, without the lockfile, the build output or the generated asset", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/feature.ts", "export const feature = true;\n");
    await seedFile(repo, "bun.lock", "the lockfile churn\n");
    await seedFile(repo, "dist/feature.js", "the compiled output\n");
    await seedFile(repo, "src/schema.generated.ts", "the generated code\n");
    const messageFile = await writeMessageFile(repo, gitMessageFileContents());
    const promptFile = `${repo}/prompt.txt`;

    const result = await runHook({ repo, messageFile, env: { STUB_PROMPT_FILE: promptFile } });

    expect(result.exitCode).toBe(0);

    const recorded = await readMessageFile(promptFile);

    expect(recorded).toContain("+export const feature = true;");
    expect(recorded).not.toContain("bun.lock");
    expect(recorded).not.toContain("dist/feature.js");
    expect(recorded).not.toContain("schema.generated.ts");
  });

  test("includes a file the repository has never seen before", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/brand-new.ts", "export const brandNew = 1;\n");
    const messageFile = await writeMessageFile(repo, gitMessageFileContents());
    const promptFile = `${repo}/prompt.txt`;

    await runHook({ repo, messageFile, env: { STUB_PROMPT_FILE: promptFile } });

    const recorded = await readMessageFile(promptFile);

    expect(recorded).toContain("new file mode");
    expect(recorded).toContain("+export const brandNew = 1;");
  });

  test("never carries the bytes of a binary file", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/feature.ts", "export const feature = true;\n");
    await seedBinaryFile(repo, "assets/logo.png", binaryHolding("NOTTEXTREADABLEBYTES"));
    const messageFile = await writeMessageFile(repo, gitMessageFileContents());
    const promptFile = `${repo}/prompt.txt`;

    const result = await runHook({ repo, messageFile, env: { STUB_PROMPT_FILE: promptFile } });

    expect(result.exitCode).toBe(0);

    const recorded = await readMessageFile(promptFile);

    expect(recorded).toContain("+export const feature = true;");
    expect(recorded).not.toContain("NOTTEXTREADABLEBYTES");
  });
});

/**
 * Bytes git must report as binary: a PNG signature, then a NUL and a sequence
 * no text decoder accepts, wrapped around a marker a leaked diff would carry
 * verbatim.
 */
function binaryHolding(marker: string): Uint8Array {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const text = Array.from(marker, (character) => character.charCodeAt(0));

  return Uint8Array.from([...png, 0x00, ...text, 0x00, 0xff, 0xfe, 0x00]);
}

describe("a commit with nothing staged", () => {
  test("never reaches the model", async () => {
    const repo = await createTempRepo();
    const untouched = gitMessageFileContents();
    const messageFile = await writeMessageFile(repo, untouched);
    const promptFile = `${repo}/prompt.txt`;

    const result = await runHook({
      repo,
      messageFile,
      env: { STUB_MODE: "fail", STUB_PROMPT_FILE: promptFile },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(await Bun.file(promptFile).exists()).toBe(false);
    expect(await readMessageFile(messageFile)).toBe(untouched);
  });
});

describe("a commit whose every staged file is excluded", () => {
  test("is skipped rather than described from an empty prompt", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "bun.lock", "the lockfile churn\n");
    const untouched = gitMessageFileContents();
    const messageFile = await writeMessageFile(repo, untouched);
    const promptFile = `${repo}/prompt.txt`;

    const result = await runHook({
      repo,
      messageFile,
      env: { STUB_MODE: "fail", STUB_PROMPT_FILE: promptFile },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(await Bun.file(promptFile).exists()).toBe(false);
    expect(await readMessageFile(messageFile)).toBe(untouched);
  });
});

describe("a change too large to describe in full", () => {
  test("is marked as truncated, so the model knows it is seeing part of the change", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/huge.ts", numberedLines(500));
    const messageFile = await writeMessageFile(repo, gitMessageFileContents());
    const promptFile = `${repo}/prompt.txt`;

    const result = await runHook({ repo, messageFile, env: { STUB_PROMPT_FILE: promptFile } });

    expect(result.exitCode).toBe(0);

    const recorded = await readMessageFile(promptFile);
    const marker = recorded.match(/truncated to the first (\d+) of (\d+) lines/);

    expect(marker).not.toBeNull();
    expect(Number(marker?.[2])).toBeGreaterThan(Number(marker?.[1]));
    expect(recorded).toContain("+line 1");
    expect(recorded).not.toContain("+line 500");
  });

  test("is not marked as truncated when the whole change fits", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "src/small.ts", numberedLines(5));
    const messageFile = await writeMessageFile(repo, gitMessageFileContents());
    const promptFile = `${repo}/prompt.txt`;

    const result = await runHook({ repo, messageFile, env: { STUB_PROMPT_FILE: promptFile } });

    expect(result.exitCode).toBe(0);

    const recorded = await readMessageFile(promptFile);

    expect(recorded).toContain("+line 5");
    expect(recorded).not.toContain("truncated");
  });
});

function numberedLines(count: number): string {
  return `${Array.from({ length: count }, (_, i) => `line ${i + 1}`).join("\n")}\n`;
}
