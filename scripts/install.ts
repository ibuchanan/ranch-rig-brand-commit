/**
 * Put the compiled artifact where git's hook can call it by bare name.
 *
 * The hook runs `brand-commit`, not `ranch-rig-brand-commit`, so placement is
 * the whole job here: the artifact is copied into a directory already on PATH
 * under its own name. Nothing about this is discoverable afterwards — a hook
 * that cannot find its binary does not complain, it simply never runs — so
 * every assumption the copy rests on is checked here and reported by name
 * rather than left to fail silently on someone's first commit.
 */

import { chmod, copyFile, mkdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const BINARY_NAME = "brand-commit";
const BIN_DIRECTORY_VARIABLE = "BRAND_COMMIT_BIN_DIR";
const DEFAULT_BIN_DIRECTORY = join(homedir(), ".local", "bin");

const artifact = join(import.meta.dir, "..", "dist", BINARY_NAME);

function refuse(remedy: string): number {
  process.stderr.write(`install ${BINARY_NAME}: ${remedy}\n`);

  return 1;
}

function isOnPath(directory: string): boolean {
  const target = resolve(directory);
  const separator = process.platform === "win32" ? ";" : ":";

  return (process.env["PATH"] ?? "")
    .split(separator)
    .some((entry) => entry !== "" && resolve(entry) === target);
}

async function isSameFile(left: string, right: string): Promise<boolean> {
  try {
    return (await realpath(left)) === (await realpath(right));
  } catch {
    return false;
  }
}

async function install(): Promise<number> {
  if (!(await Bun.file(artifact).exists())) {
    return refuse(
      `${artifact} does not exist. Run \`bun run build\` first, or use \`bun run install:tool\`, which builds first.`,
    );
  }

  const directory = process.env[BIN_DIRECTORY_VARIABLE] ?? DEFAULT_BIN_DIRECTORY;
  const destination = join(directory, BINARY_NAME);

  // Checked before copying rather than after: an artifact the hook cannot name
  // is not an install, and saying so here beats a silent no-op on first commit.
  if (!isOnPath(directory)) {
    return refuse(
      `${directory} is not on PATH, so the hook could not invoke ${BINARY_NAME} by name.\n` +
        `Add it to your shell profile:\n` +
        `  export PATH="${directory}:$PATH"\n` +
        `or point ${BIN_DIRECTORY_VARIABLE} at a directory that is already on PATH.`,
    );
  }

  await mkdir(directory, { recursive: true });
  await copyFile(artifact, destination);
  await chmod(destination, 0o755);

  const resolved = Bun.which(BINARY_NAME);

  if (resolved === null || !(await isSameFile(resolved, destination))) {
    return refuse(
      `copied to ${destination}, but ${BINARY_NAME} on PATH resolves to ${resolved ?? "nothing"}.\n` +
        `An earlier copy in PATH wins. Remove it, or install over it.`,
    );
  }

  const version = Bun.spawnSync([destination, "--version"]);

  if (version.exitCode !== 0) {
    return refuse(
      `copied to ${destination}, but running it failed:\n${version.stderr.toString().trim()}`,
    );
  }

  process.stdout.write(
    [
      `installed ${destination} (${version.stdout.toString().trim()})`,
      `${BINARY_NAME} on PATH now resolves to that file, so the hook can call it by name.`,
      `Remaining steps are in the README: wire it into lefthook.yml, then run \`lefthook install\`.`,
      "",
    ].join("\n"),
  );

  return 0;
}

process.exitCode = await install();