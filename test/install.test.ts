import { describe, expect, test } from "bun:test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { VERSION } from "../src/version";
import {
  commitEnvironment,
  createTempDirectory,
  createTempRepo,
  git,
  gitOrThrow,
  installPrepareCommitMsgHook,
  runByBareName,
  runInstaller,
  seedFile,
  stubDirectory,
  SYSTEM_PATH_DIRECTORIES,
  systemOnlyPath,
} from "./helpers";

async function installedBinary(): Promise<{ binDirectory: string; path: string }> {
  const binDirectory = await createTempDirectory();
  const path = [binDirectory, ...SYSTEM_PATH_DIRECTORIES].join(":");

  const install = await runInstaller({ binDirectory, path });

  expect(install.exitCode).toBe(0);

  return { binDirectory, path };
}

describe("installing the tool", () => {
  test("puts it on PATH under the bare name the hook calls, needing nothing else installed", async () => {
    const { binDirectory, path } = await installedBinary();

    expect(await Bun.file(join(binDirectory, "brand-commit")).exists()).toBe(true);

    const run = await runByBareName("brand-commit", ["--version"], path, binDirectory);

    expect(run.exitCode).toBe(0);
    expect(run.stdout.trim()).toBe(VERSION);
  });

  test("refuses a directory the hook could not reach, rather than installing somewhere inert", async () => {
    const binDirectory = await createTempDirectory();

    const install = await runInstaller({ binDirectory, path: systemOnlyPath() });

    expect(install.exitCode).not.toBe(0);
    expect(install.stderr).toContain(binDirectory);
    expect(install.stderr).toContain("PATH");
    expect(await Bun.file(join(binDirectory, "brand-commit")).exists()).toBe(false);
  });

  test("refuses when an earlier copy in PATH would win, and names the copy that does", async () => {
    const { binDirectory, path } = await installedBinary();
    const shadowDirectory = await createTempDirectory();
    const shadow = join(shadowDirectory, "brand-commit");

    await Bun.write(shadow, "#!/bin/sh\necho 0.0.0-shadowed\n");
    await chmod(shadow, 0o755);

    const install = await runInstaller({
      binDirectory,
      path: [shadowDirectory, path].join(":"),
    });

    expect(install.exitCode).not.toBe(0);
    expect(install.stderr).toContain(shadow);
    expect(install.stderr).toContain(join(binDirectory, "brand-commit"));
  });

  test("produces a binary a bare commit reaches by name, through lefthook", async () => {
    const { binDirectory } = await installedBinary();
    const repo = await createTempRepo();

    await installPrepareCommitMsgHook(repo);
    await seedFile(repo, "src/a.txt", "const a = 1;\n");

    const commit = await git(
      repo,
      ["commit", "--quiet"],
      commitEnvironment({
        PATH: [stubDirectory, binDirectory, ...SYSTEM_PATH_DIRECTORIES].join(":"),
        STUB_OUTPUT: "feat(JRA-7): install the tool",
      }),
    );
    const subject = await gitOrThrow(repo, ["log", "-1", "--format=%s"]);

    expect(commit.exitCode).toBe(0);
    expect(subject.stdout.trim()).toBe("feat(JRA-7): install the tool");
  });
});