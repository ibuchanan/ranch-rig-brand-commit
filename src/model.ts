export type ModelResponse = { ok: true; message: string } | { ok: false; cause: string };

export async function requestCommitMessage(
  model: string | undefined,
  prompt: string,
  diff: string,
): Promise<ModelResponse> {
  const args = ["rovo", ...(model === undefined ? [] : ["--model", model]), prompt];

  const proc = Bun.spawn(args, {
    stdin: Buffer.from(diff),
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, , exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    return { ok: false, cause: `the model command exited ${exitCode}` };
  }

  return { ok: true, message: stdout.trim() };
}
