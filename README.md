# brand-commit

A `prepare-commit-msg` hook that generates commit messages with Rovo.

The tool is written in TypeScript on Bun and shipped as a single compiled
executable named `brand-commit`. The binary name is independent of the package
name, and the artifact needs no JavaScript runtime on the machine that runs it.

## Build

```bash
bun install
bun run build
```

`bun run build` compiles `src/index.ts` into a standalone executable at
`dist/brand-commit`. That is the only build step.

## Test

```bash
bun run test
```

`bun run test` builds the binary and runs the suite against the compiled
artifact, never against `src`. Every test spawns `dist/brand-commit` as a
subprocess in its own throwaway git repository, and asserts only on the exit
code, the commit message file, and stderr.

Several tests commit for real through a lefthook-installed
`prepare-commit-msg` hook, so `lefthook` must be on `PATH`.

Model calls are replaced at the single seam the suite is allowed:
`test/stubs/rovo` sits on `PATH` ahead of the system directories and returns
canned output, so no test makes a real Rovo call.

## Ticket key

The tool hands a Jira issue key to the model as context. It does not decide
where the key appears in the message — that belongs to the `git-commit` skill.

There are two ways to supply it, and they behave differently.

Set it on the same command line as the commit:

```bash
BRAND_COMMIT_TICKET=JRA-123 GIT_EDITOR=true git commit
```

An agent that runs one Bash call per command gets a fresh shell each time, so
`export BRAND_COMMIT_TICKET=JRA-123` in an earlier call is gone by the next one.
Nothing the tool can do recovers that, which is what the second channel is for.

Write it to `.git/brand-commit-ticket` and commit whenever:

```bash
echo JRA-123 > .git/brand-commit-ticket
git commit
```

The sidecar lives under `.git/` because git never tracks anything there, so the
key cannot leak into a commit. It is read once and deleted before the model is
called, so it cannot outlive the commit it was written for — an abandoned commit
loses its key rather than handing it to the next one. A key that did survive a
commit is reported on stderr as suspect, since a key attributed to the wrong
ticket is worse than no key at all.

## Type check

```bash
bun run typecheck
```
