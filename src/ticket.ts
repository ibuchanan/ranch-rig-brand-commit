import { rm } from "node:fs/promises";
import { join } from "node:path";

/**
 * The primary channel. Read from the environment of the hook process, which is
 * the environment of the `git commit` invocation that triggered it — so it is
 * only ever set when it was prefixed onto that same command line. An agent
 * running one Bash call per command gets a fresh shell each time, so exporting
 * the variable in an earlier call reaches nothing; that is a property of the
 * caller's shells, not something the tool can recover from, and it is why the
 * sidecar below exists.
 */
export const TICKET_ENV = "BRAND_COMMIT_TICKET";

/**
 * A name rather than a path: the sidecar always sits in the repository's `.git`
 * directory, which git never tracks and never stages, so a key written there
 * cannot reach a commit even if the tool never runs at all.
 */
export const SIDECAR_NAME = "brand-commit-ticket";

/**
 * `suspect` means the key was written before a commit that has since landed and
 * was not used by it — the shape a key takes when the commit it was written for
 * was abandoned. It is reported rather than honoured silently, because a key
 * attributed to the wrong ticket is worse than no key at all.
 */
export type TicketKey = { kind: "none" } | { kind: "key"; value: string; suspect: boolean };

/**
 * The single place a ticket key enters the tool. Prompt assembly takes the
 * result of this call rather than reaching for a channel itself, so a third
 * channel is a new branch here and nothing anywhere else.
 */
export async function ticketKeyFor(cwd: string): Promise<TicketKey> {
  const inline = process.env[TICKET_ENV]?.trim();

  if (inline !== undefined && inline !== "") {
    return { kind: "key", value: inline, suspect: false };
  }

  return await sidecarKey(cwd, join(cwd, ".git", SIDECAR_NAME));
}

/**
 * The sidecar is consumed by being deleted, and it is deleted here — before the
 * model is called, not after the commit lands. An abandoned commit therefore
 * loses its key rather than handing it to whatever comes next, which is the
 * hazard the file is prone to: it survives a failed commit by construction.
 */
async function sidecarKey(cwd: string, path: string): Promise<TicketKey> {
  const sidecar = Bun.file(path);

  if (!(await sidecar.exists())) {
    return { kind: "none" };
  }

  const value = (await sidecar.text()).trim();
  const writtenAt = (await sidecar.stat()).mtime;

  await rm(path, { force: true });

  if (value === "") {
    return { kind: "none" };
  }

  return { kind: "key", value, suspect: await outlivedACommit(cwd, writtenAt) };
}

/**
 * A key written before the most recent commit landed cannot have been used by
 * that commit — had it been, this run would have consumed and deleted it. That
 * is the whole test, and it holds whatever the earlier commit was.
 *
 * The comparison is in whole seconds because git reports commit times that way,
 * so a key written in the same second as the previous commit reads as current.
 * The failure is a missing warning rather than a wrong attribution: the key is
 * still consumed, and the commit it lands on is still described from a real
 * diff.
 */
async function outlivedACommit(cwd: string, writtenAt: Date): Promise<boolean> {
  const lastCommit = await lastCommitSeconds(cwd);

  return lastCommit !== undefined && Math.floor(writtenAt.getTime() / 1000) < lastCommit;
}

async function lastCommitSeconds(cwd: string): Promise<number | undefined> {
  const proc = Bun.spawn(["git", "log", "-1", "--format=%ct"], {
    cwd,
    stdout: "pipe",
    stderr: "ignore",
  });

  const [stdout] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  const seconds = Number(stdout.trim());

  return Number.isFinite(seconds) ? seconds : undefined;
}