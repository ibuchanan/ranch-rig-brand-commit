import { afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Subprocess } from "bun";

export const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const binaryPath = join(projectRoot, "dist", "brand-commit");
export const stubDirectory = join(projectRoot, "test", "stubs");

export const LEFTHOOK_UNFILLED_PLACEHOLDER = "{2}";

const SYSTEM_PATH_DIRECTORIES = ["/usr/bin", "/bin"];

const GIT_ENVIRONMENT = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "brand-commit tests",
  GIT_AUTHOR_EMAIL: "tests@example.invalid",
  GIT_COMMITTER_NAME: "brand-commit tests",
  GIT_COMMITTER_EMAIL: "tests@example.invalid",
};

const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true })));
  temporaryDirectories.length = 0;
});

export type ProcessResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type StubMode = "ok" | "empty" | "garbage" | "fail";

export type StubOptions = {
  mode?: StubMode;
  output?: string;
  promptFile?: string;
};

const SCRUBBED_ENVIRONMENT_PREFIXES = ["GIT_", "BRAND_COMMIT_", "STUB_"];

function inheritedEnvironment(): Record<string, string> {
  const environment: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    const scrubbed = SCRUBBED_ENVIRONMENT_PREFIXES.some((prefix) => key.startsWith(prefix));

    if (value !== undefined && !scrubbed) {
      environment[key] = value;
    }
  }

  return environment;
}

function piped(stream: number | ReadableStream<Uint8Array> | undefined): ReadableStream<Uint8Array> {
  if (!(stream instanceof ReadableStream)) {
    throw new Error("expected a piped stream; the harness always spawns with stdout/stderr piped");
  }

  return stream;
}

async function collect(proc: Subprocess): Promise<ProcessResult> {
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(piped(proc.stdout)).text(),
    new Response(piped(proc.stderr)).text(),
    proc.exited,
  ]);

  return { exitCode, stdout, stderr };
}

function spawnEnvironment(overrides: Record<string, string> | undefined): Record<string, string> {
  return { ...inheritedEnvironment(), ...GIT_ENVIRONMENT, ...overrides };
}

function spawnStdin(stdin: string | undefined): Buffer | "ignore" {
  return stdin === undefined ? "ignore" : Buffer.from(stdin);
}

export function stubbedPath(): string {
  return [stubDirectory, ...SYSTEM_PATH_DIRECTORIES].join(":");
}

export function stubEnvironment(options: StubOptions = {}): Record<string, string> {
  const environment: Record<string, string> = { PATH: stubbedPath() };

  if (options.mode !== undefined) {
    environment["STUB_MODE"] = options.mode;
  }

  if (options.output !== undefined) {
    environment["STUB_OUTPUT"] = options.output;
  }

  if (options.promptFile !== undefined) {
    environment["STUB_PROMPT_FILE"] = options.promptFile;
  }

  return environment;
}

export async function ensureBinary(): Promise<void> {
  if (!(await Bun.file(binaryPath).exists())) {
    throw new Error(
      `${binaryPath} is missing. The suite tests the compiled binary; run \`bun run build\` first.`,
    );
  }
}

export async function runBinary(
  args: string[],
  options: {
    cwd: string;
    env?: Record<string, string>;
    stdin?: string;
  },
): Promise<ProcessResult> {
  await ensureBinary();

  return collect(
    Bun.spawn([binaryPath, ...args], {
      cwd: options.cwd,
      env: spawnEnvironment(options.env),
      stdin: spawnStdin(options.stdin),
      stdout: "pipe",
      stderr: "pipe",
    }),
  );
}

export function hookEnvironment(overrides: Record<string, string> = {}): Record<string, string> {
  return { ...stubEnvironment(), ...overrides };
}

export async function runHook(options: {
  repo: string;
  messageFile: string;
  commitSource?: string | null;
  env?: Record<string, string>;
  stdin?: string;
}): Promise<ProcessResult> {
  const args = [options.messageFile];

  if (options.commitSource !== null) {
    args.push(options.commitSource ?? LEFTHOOK_UNFILLED_PLACEHOLDER);
  }

  return runBinary(args, {
    cwd: options.repo,
    env: hookEnvironment(options.env),
    ...(options.stdin === undefined ? {} : { stdin: options.stdin }),
  });
}

export async function runStub(
  args: string[],
  options: { cwd: string; stub?: StubOptions; stdin?: string },
): Promise<ProcessResult> {
  return collect(
    Bun.spawn(["rovo", ...args], {
      cwd: options.cwd,
      env: spawnEnvironment(stubEnvironment(options.stub ?? {})),
      stdin: spawnStdin(options.stdin),
      stdout: "pipe",
      stderr: "pipe",
    }),
  );
}

export async function git(cwd: string, args: string[]): Promise<ProcessResult> {
  return collect(
    Bun.spawn(["git", ...args], {
      cwd,
      env: spawnEnvironment(undefined),
      stdout: "pipe",
      stderr: "pipe",
    }),
  );
}

export async function gitOrThrow(cwd: string, args: string[]): Promise<ProcessResult> {
  const result = await git(cwd, args);

  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }

  return result;
}

export async function createTempRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "brand-commit-"));
  temporaryDirectories.push(repo);

  await gitOrThrow(repo, ["init", "--quiet", "--initial-branch=main"]);

  return repo;
}

export async function seedFile(repo: string, path: string, contents: string): Promise<void> {
  await Bun.write(join(repo, path), contents);
  await gitOrThrow(repo, ["add", "--", path]);
}

export function messageFilePath(repo: string): string {
  return join(repo, ".git", "COMMIT_EDITMSG");
}

export async function writeMessageFile(repo: string, contents: string): Promise<string> {
  const path = messageFilePath(repo);
  await Bun.write(path, contents);

  return path;
}

export async function readMessageFile(path: string): Promise<string> {
  return await Bun.file(path).text();
}