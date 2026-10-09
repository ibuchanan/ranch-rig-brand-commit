import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import pkg from "../package.json";
import {
  binaryPath,
  createTempRepo,
  git,
  gitOrThrow,
  hookEnvironment,
  projectRoot,
  readMessageFile,
  runBinary,
  runStub,
  seedFile,
  stubbedPath,
  stubDirectory,
} from "./helpers";

describe("build artifact", () => {
  test("builds a single executable named brand-commit", async () => {
    const stat = await Bun.file(binaryPath).stat();

    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBeGreaterThan(0);
    expect(stat.mode & 0o111).not.toBe(0);
  });

  test("runs with no JavaScript runtime on PATH", async () => {
    const repo = await createTempRepo();

    const result = await runBinary(["--version"], {
      cwd: repo,
      env: { PATH: stubbedPath() },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toBe(pkg.version);
  });

  test("--version reports the package version", async () => {
    const repo = await createTempRepo();

    const result = await runBinary(["--version"], { cwd: repo });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toBe(pkg.version);
  });

  test("--help reports the invocation contract", async () => {
    const repo = await createTempRepo();

    for (const flag of ["--help", "-h"]) {
      const result = await runBinary([flag], { cwd: repo });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("brand-commit");
      expect(result.stdout).toContain("<message-file>");
      expect(result.stdout).toContain("<commit-source>");
      expect(result.stdout).toContain("BRAND_COMMIT_DISABLE");
      expect(result.stdout).toContain("BRAND_COMMIT_TICKET");
      expect(result.stdout).toContain("BRAND_COMMIT_MODEL");
    }
  });

  test("reports usage on stderr and exits non-zero when invoked with no arguments", async () => {
    const repo = await createTempRepo();

    const result = await runBinary([], { cwd: repo });

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("<message-file>");
  });
});

describe("model stub", () => {
  test("sits on PATH in front of the system directories", async () => {
    expect(stubbedPath().split(":")[0]).toBe(stubDirectory);
    expect(await Bun.file(join(stubDirectory, "rovo")).exists()).toBe(true);
  });

  test("returns canned output without reaching a real rovo", async () => {
    const repo = await createTempRepo();

    const result = await runStub(["generate", "a message"], {
      cwd: repo,
      stub: { output: "feat(JRA-123): canned" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("feat(JRA-123): canned\n");
  });

  test("can be made to fail, empty, or return junk", async () => {
    const repo = await createTempRepo();

    const failing = await runStub([], { cwd: repo, stub: { mode: "fail" } });
    expect(failing.exitCode).not.toBe(0);
    expect(failing.stderr).toContain("stubbed");

    const empty = await runStub([], { cwd: repo, stub: { mode: "empty" } });
    expect(empty.exitCode).toBe(0);
    expect(empty.stdout).toBe("");

    const garbage = await runStub([], { cwd: repo, stub: { mode: "garbage" } });
    expect(garbage.exitCode).toBe(0);
    expect(garbage.stdout).toContain("```text");
  });

  test("records the prompt it is given so tests can assert on it", async () => {
    const repo = await createTempRepo();
    const promptFile = join(repo, "prompt.txt");

    const result = await runStub(["generate"], {
      cwd: repo,
      stub: { promptFile },
      stdin: "the diff under test\n",
    });

    expect(result.exitCode).toBe(0);

    const recorded = await readMessageFile(promptFile);
    expect(recorded).toContain("generate");
    expect(recorded).toContain("the diff under test");
  });

  test("is the first PATH entry every hook invocation sees", () => {
    expect(hookEnvironment()["PATH"]).toBe(stubbedPath());
    expect(hookEnvironment()["PATH"]?.split(":")[0]).toBe(stubDirectory);
  });
});

describe("throwaway repositories", () => {
  test("each call returns an isolated repository", async () => {
    const first = await createTempRepo();
    const second = await createTempRepo();

    expect(first).not.toBe(second);

    await seedFile(first, "first.txt", "first\n");
    await gitOrThrow(first, ["commit", "--quiet", "-m", "first"]);

    const firstLog = await gitOrThrow(first, ["log", "--format=%s"]);
    const secondLog = await git(second, ["log", "--format=%s"]);
    const secondTop = await git(second, ["rev-parse", "--verify", "HEAD"]);

    expect(firstLog.stdout.trim()).toBe("first");
    expect(secondLog.stdout.trim()).toBe("");
    expect(secondTop.exitCode).not.toBe(0);
  });

  test("ignore the developer's git configuration", async () => {
    const repo = await createTempRepo();
    await seedFile(repo, "a.txt", "a\n");

    const commit = await git(repo, ["commit", "--quiet", "-m", "authored by the harness"]);

    expect(commit.exitCode).toBe(0);

    const author = await gitOrThrow(repo, ["log", "-1", "--format=%an <%ae>"]);
    expect(author.stdout.trim()).toBe("brand-commit tests <tests@example.invalid>");
  });

  test("are created outside the project tree", async () => {
    const repo = await createTempRepo();

    expect(repo.startsWith(projectRoot)).toBe(false);
  });
});
