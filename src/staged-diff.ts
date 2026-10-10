/**
 * The most the model will ever be shown. A vendored directory or a lockfile
 * rewrite can produce a diff of any size, and an unbounded one turns a commit
 * into an unbounded prompt. The ceiling is fixed rather than configurable: a
 * knob here is a knob nobody sets, and a default nobody raises.
 */
const MAX_DIFF_LINES = 300;

/**
 * Why a capture is short, recorded alongside it rather than recomputed by
 * whoever reads it. `clipped` is the only thing that can produce a body shorter
 * than the diff it came from, so the notice that goes to the model is emitted
 * from the same value that caused the clipping — silent truncation is not
 * representable, only silent *forgetting* to mention it is.
 */
export type Truncation = { kind: "none" } | { kind: "clipped"; shownLines: number; totalLines: number };

/**
 * The three ways a staged change can fail to be describable, kept distinct
 * because they are different facts about the commit and only two of them are
 * visible in the diff itself:
 *
 * - `empty` — nothing was staged. The commit changes nothing.
 * - `all-excluded` — files were staged, and every one of them is a lockfile,
 *   build output or generated asset. The commit changes something, but nothing
 *   a message should describe.
 * - `captured` — there is a change to describe, bounded by the ceiling above.
 *
 * The first two are collapsed into the same outcome later, because both
 * correctly do nothing and exit zero. They stay apart here because a single
 * "is the diff empty" check cannot tell them apart, and confusing them is how a
 * lockfile-only commit ends up described as if it were `--allow-empty`.
 */
export type Capture =
  | { kind: "empty" }
  | { kind: "all-excluded" }
  | { kind: "captured"; body: string; truncation: Truncation };

/**
 * Paths that never reach the model. A dependency bump should not become the
 * subject of the commit, a build artifact commit should not produce a nonsense
 * message, and generated code is not what the change was for.
 *
 * Directory names are anchored to the repository root, so a source directory
 * that merely happens to be called `out` is not silently dropped. File patterns
 * match at any depth, because a lockfile is a lockfile wherever it sits.
 */
const EXCLUDED_PATHS = [
  "**/*.lock",
  "**/package-lock.json",
  "**/npm-shrinkwrap.json",
  "**/pnpm-lock.yaml",
  "**/go.sum",
  "dist/**",
  "build/**",
  "out/**",
  "target/**",
  "coverage/**",
  "node_modules/**",
  "vendor/**",
  ".next/**",
  "**/*.min.js",
  "**/*.min.css",
  "**/*.map",
  "**/*.tsbuildinfo",
  "**/__generated__/**",
  "**/*.generated.*",
  "**/*.pb.go",
  "**/*.pb.cc",
  "**/*.pb.h",
  "**/*_pb2.py",
  "**/*.designer.cs",
  "**/*.g.dart",
  "**/*_pb.js",
];

async function gitOutput(cwd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, , exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed`);
  }

  return stdout;
}

/**
 * The staged change, and nothing else. The working tree is deliberately not
 * consulted: unstaged edits are not being committed, and describing them would
 * produce a message that lies about this commit.
 */
export async function captureStagedDiff(cwd: string): Promise<Capture> {
  const stagedPaths = await gitOutput(cwd, ["diff", "--cached", "--name-only"]);

  if (stagedPaths.trim() === "") {
    return { kind: "empty" };
  }

  const filtered = await gitOutput(cwd, [
    "diff",
    "--cached",
    "--no-color",
    "--no-ext-diff",
    ...EXCLUDED_PATHS.map((path) => `:(top,glob,exclude)${path}`),
  ]);

  if (filtered.trim() === "") {
    return { kind: "all-excluded" };
  }

  const lines = filtered.split("\n");

  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  const shownLines = Math.min(lines.length, MAX_DIFF_LINES);
  const clipped = shownLines < lines.length;

  return {
    kind: "captured",
    // Clipping mid-stream must still end on a line boundary, or the model is
    // handed what looks like a malformed diff rather than a short one.
    body: `${lines.slice(0, shownLines).join("\n")}\n`,
    truncation: clipped
      ? { kind: "clipped", shownLines, totalLines: lines.length }
      : { kind: "none" },
  };
}
