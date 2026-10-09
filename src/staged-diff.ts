export async function stagedDiff(cwd: string): Promise<string> {
  const proc = Bun.spawn(["git", "diff", "--cached"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [diff, , exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error("git diff --cached failed");
  }

  return diff;
}
