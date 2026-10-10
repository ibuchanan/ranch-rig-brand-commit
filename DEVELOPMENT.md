# Development

The inner loop for working on `brand-commit` itself. To install and use the
tool, see [README.md](README.md).

## Prerequisites

- [Bun](https://bun.sh) — runtime, test runner and compiler
- `lefthook` on `PATH` — several tests install a real `prepare-commit-msg` hook
  and commit through it
- `git`

`rovo` is **not** required: the suite stubs it.

## Commands

| Command | Does |
| --- | --- |
| `bun install` | Installs dev dependencies. |
| `bun run build` | Compiles `src/index.ts` into `dist/brand-commit`. |
| `bun run install:tool` | Builds, then copies the artifact onto `PATH`. |
| `bun run test` | Builds, then runs the suite. |
| `bun run typecheck` | `tsc --noEmit` over `src`, `test` and `scripts`. |

Install copies rather than links, so after changing anything under `src` run
`bun run build` for the suite and `bun run install:tool` if you want the hook on
a real repository to pick the change up.

The script is named `install:tool`, not `install`. `install` is a lifecycle name:
`bun install` runs `preinstall`, `install` and `postinstall` on every dependency
install, so a script by that name would rebuild and copy the binary onto your
`PATH` without being asked — verified, in a throwaway package.

## Repository structure

```text
src/           the tool, one concern per file
  index.ts     entrypoint; nothing but an exit code
  cli.ts       argument parsing, --help, --version
  commit-source.ts   decides whether this invocation should generate at all
  staged-diff.ts     captures the staged set, applies exclusions, bounds the size
  ticket.ts    the only place a ticket key enters
  prompt.ts    request assembly: diff, key, truncation notice
  model.ts     the rovo call
  sanitize.ts  strips fences, quotes and preamble; rejects what is left unusable
  message-file.ts    edits the message region, leaves git's comments alone
  outcome.ts   turns a decision into an exit code and one line of stderr
scripts/install.ts   places the built artifact on PATH
test/          black-box suite; no test imports src/
specs/         the design the implementation answers to
```

## How the suite works

Every test spawns the **compiled binary** as a subprocess in its own throwaway
git repository, and asserts only on the exit code, the commit message file, and
stderr. Nothing imports an internal function, so the internals can be rewritten
as long as observable behaviour holds.

The build is a prerequisite, which is why `bun run test` builds first. Testing
uncompiled sources would leave argument dispatch and file handling — most of
the program — untested.

**One seam: the model call.** `test/stubs/rovo` sits on `PATH` ahead of the
system directories and stands in for the real CLI, so no test makes a Rovo call
and nothing in the suite needs network access or credentials. Everything else is
real: real git, real lefthook, real hook arguments.

The stub reads its behaviour from the environment:

| Variable | Effect |
| --- | --- |
| `STUB_MODE` | `ok` (default), `empty`, `garbage`, `fail`, `hang`. |
| `STUB_OUTPUT` | The message the stub returns. |
| `STUB_PROMPT_FILE` | Write argv and stdin to this file, to assert on. |
| `STUB_SLEEP_SECONDS` | How long `hang` sleeps, for timeout tests. |

`test/helpers.ts` holds the harness: temp repositories, git and binary spawning,
PATH construction, and `installPrepareCommitMsgHook`, which writes the same
`lefthook.yml` the README documents and runs `lefthook install`. Change the
documented wiring and the suite follows it.

## Troubleshooting

**A commit hangs, or fails with an empty message.** The hook is not installed.
A `lefthook.yml` alone installs nothing; run `lefthook install` in the
repository.

**Editing `lefthook.yml` seems to do nothing.** It does not — the installed
hook is a shim that calls `lefthook run prepare-commit-msg`, which reads the
config at run time. Only the *first* `lefthook install` is needed; re-running it
harmless but unnecessary.

**`the model could not be reached`.** `rovo` is not on `PATH` for that process.
The hook inherits the environment of the `git commit` that triggered it, which
is not necessarily the one in your editor.

**A test fails with `lefthook is not on PATH`.** Install lefthook; the
end-to-end tests commit through a real hook and cannot be stubbed.

**`the suite tests the compiled binary; run bun run build first`.** The
artifact is missing or was cleaned. `bun run test` rebuilds.
