import type { Cause } from "./outcome";

export type ModelOutcome = { kind: "answered"; message: string } | { kind: "failed"; cause: Cause };

const DEFAULT_TIMEOUT_MS = 30_000;

const TIMED_OUT = Symbol("timed out");

function firstLine(detail: string): string {
  return detail.split("\n")[0] ?? "";
}

function spawnModel(args: string[], diff: string) {
  return Bun.spawn(args, {
    stdin: Buffer.from(diff),
    stdout: "pipe" as const,
    stderr: "pipe" as const,
  });
}

function deadlineMs(): number {
  const configured = Number(process.env["BRAND_COMMIT_TIMEOUT_MS"]);

  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

export async function requestCommitMessage(
  model: string | undefined,
  prompt: string,
  diff: string,
): Promise<ModelOutcome> {
  const args = ["rovo", ...(model === undefined ? [] : ["--model", model]), prompt];
  const afterMs = deadlineMs();

  let proc: ReturnType<typeof spawnModel>;

  try {
    proc = spawnModel(args, diff);
  } catch (error) {
    return { kind: "failed", cause: { kind: "unreachable", detail: firstLine(String(error)) } };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<typeof TIMED_OUT>((resolveDeadline) => {
    timer = setTimeout(() => {
      proc.kill();
      resolveDeadline(TIMED_OUT);
    }, afterMs);
  });

  const [stdout, , exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    Promise.race([proc.exited, deadline]),
  ]);

  clearTimeout(timer);

  if (exitCode === TIMED_OUT) {
    return { kind: "failed", cause: { kind: "timed-out", afterMs } };
  }

  if (exitCode !== 0) {
    return { kind: "failed", cause: { kind: "model-failed", exitCode } };
  }

  const message = stdout.trim();

  if (message === "") {
    return { kind: "failed", cause: { kind: "unusable-response" } };
  }

  return { kind: "answered", message };
}
