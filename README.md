# brand-commit

A `prepare-commit-msg` hook that writes your commit message for you.

On a bare `git commit` it captures the staged diff, asks Rovo for a message
using the `git-commit` skill, and drops the result into the commit message file
so your editor opens with something to review. An agent that runs
`GIT_EDITOR=true git commit` gets a finished commit instead of a hang.

## What it does

- Generates **one** message from the **staged** diff — the same change set you
  are committing, not the working tree.
- Leaves Git's comment scaffolding in the message file intact, so the editor
  guidance you rely on is still there.
- Reports one line on stderr naming the cause when it cannot produce a message,
  and stops the commit rather than writing something empty or made up.

## What it will not do

- **It does not own the message format.** Subject shape, body structure and
  where the issue key goes belong to the `git-commit` skill, which the prompt
  invokes. This tool passes the key as context and gets out of the way, so the
  rules can change without a code change here.
- **It does not validate.** Generation is not a gate. A blocking Conventional
  Commit check belongs in `commit-msg`.
- **It does not describe lockfiles, build output, generated assets or binary
  files**, and it does not describe unstaged edits. A commit of nothing but a
  lockfile is not something a message should describe.
- **It does not overwrite a message you supplied.** `git commit -m`, `-F`, `-t`,
  `--amend`, `git merge` and squashes are all left exactly as git produced them.
- **It does not install itself into `.git/hooks`.** lefthook owns that, and it
  will not do it until you ask — see [Confirm the hook is live](#confirm-the-hook-is-live).

## Prerequisites

- `git`
- [`lefthook`](https://github.com/evilmartians/lefthook) — the hook manager that
  wires the hook into a repository
- `rovo` on `PATH` — the model is invoked as `rovo [--model <id>] <prompt>`,
  with the diff on stdin
- To build it: [Bun](https://bun.sh)

Consumers of the installed binary need only `git`, `lefthook` and `rovo`. The
artifact is a standalone executable with no JavaScript runtime of its own, so it
runs on a machine with no JS toolchain. Bun is only needed to build it.

## Install

```bash
bun install
bun run install:tool
```

`bun run install:tool` builds the artifact and copies it to `~/.local/bin`
under the name `brand-commit`, which is the name the hook calls. `bun run
build` on its own produces the artifact at `dist/brand-commit` without
installing it.

Set `BRAND_COMMIT_BIN_DIR` to install somewhere else. The installer refuses to
install into a directory that is not on `PATH`, or where an earlier copy in
`PATH` would win — a hook that cannot find its binary does not complain, it
simply never runs, and that is the failure this check exists to prevent.

## Wire it into a repository

Add this to the repository's `lefthook.yml`:

```yaml
prepare-commit-msg:
  commands:
    brand-commit:
      run: brand-commit {1} {2}
```

`{1}` and `{2}` are git's own arguments to the hook: the message file to write,
and the commit source. `brand-commit --help` documents both.

Then install the hook:

```bash
lefthook install
```

**This step is not optional.** A `lefthook.yml` on its own installs nothing —
verified against lefthook 2.2.1, `.git/hooks` stays empty until `lefthook
install` runs, and the tool is never invoked.

## Confirm the hook is live

Three checks, cheapest first. All three are worth running once per repository,
because the failure this tool is most prone to is a hook that silently never
fires.

```bash
# 1. lefthook has written the hook at all
test -x .git/hooks/prepare-commit-msg && echo "hook installed"

# 2. lefthook can run the configured command — this is what fails, loudly,
#    if brand-commit is not on PATH. The disable flag neutralises the tool,
#    so nothing is generated and no model is called.
BRAND_COMMIT_DISABLE=1 lefthook run prepare-commit-msg -- .git/COMMIT_EDITMSG

# 3. and now a real commit, which is the only thing that proves git fires it
git commit
```

Check 3 cannot be faked: `git commit --dry-run` does **not** run
`prepare-commit-msg`, so a dry run tells you nothing about whether the hook is
live.

## Use it

### Assisted mode — an agent committing

This is the primary use. Stage the files, then:

```bash
GIT_EDITOR=true git commit
```

With a ticket key, on the same command line:

```bash
BRAND_COMMIT_TICKET=JRA-123 GIT_EDITOR=true git commit
```

The variable has to be on that line. An agent running one shell per command gets
a fresh shell each time, so `export BRAND_COMMIT_TICKET=...` in an earlier
command reaches nothing.

To set the key once and commit later, write it to a sidecar file instead:

```bash
echo JRA-123 > .git/brand-commit-ticket
git commit
```

The sidecar lives under `.git/` because git never tracks anything there, so the
key cannot leak into a commit. It is read once and deleted before the model is
called, so an abandoned commit loses its key rather than handing it to the next
one. A key that did survive a commit is reported on stderr as suspect, because
a key attributed to the wrong ticket is worse than no key at all.

The tool hands the key to the model and leaves placement to the `git-commit`
skill.

### Direct mode — a person committing

```bash
git commit
```

Your editor opens with the generated message pre-filled. Edit it, or accept it.
One message is generated; there is no interactive choice between candidates.

## When it deliberately does nothing

Doing nothing is the correct outcome, not a failure, and the commit proceeds:

- Nothing is staged — there is nothing to describe.
- Everything staged was excluded as lockfile, build output or generated asset.
- Git already supplied a message (`message`, `template`, `merge`, `squash`,
  `commit`).
- The message file already has a message in it.
- `BRAND_COMMIT_DISABLE` is set to anything.

## When it fails, and how to bypass it

Git treats any non-zero exit from `prepare-commit-msg` as fatal, so a failure
**aborts the commit** and leaves the repository untouched. One line on stderr
says why, because the remedy differs: an unreachable model, a timeout, a model
that exited non-zero, an unusable response, an unreadable message file, or a
commit source this build does not recognise.

| Exit | Meaning |
| --- | --- |
| `0` | Nothing to do, or a message was written. |
| `1` | Asked for a message, could not produce one. |
| `2` | Usage error; the message file is unreadable. |
| `3` | A commit source this build does not know. |

Two bypasses, so a broken tool cannot lock you out of committing:

```bash
git commit -m "fix(JRA-123): the message I actually wanted"  # skips the tool
BRAND_COMMIT_DISABLE=1 git commit                           # tool stands down
```

## Configuration

- `BRAND_COMMIT_TICKET` — ticket key to hand the model as context. Must be set
  on the `git commit` command line.
- `BRAND_COMMIT_DISABLE` — any value leaves the commit message alone.
- `BRAND_COMMIT_MODEL` — model identifier to request from `rovo`.
- `BRAND_COMMIT_TIMEOUT_MS` — how long to wait for the model. Defaults to
  30000.
- `BRAND_COMMIT_BIN_DIR` — where `bun run install:tool` puts the binary.
  Defaults to `~/.local/bin`.
- `BRAND_COMMIT_SOURCE` — overrides commit-source detection. An escape hatch for
  a lefthook that stops passing `{2}`.

The diff is capped at 300 lines. When that bites, the model is told it is seeing
part of the change, so a truncated diff cannot be described as though it were
the whole thing.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for the inner loop, the repository layout,
and how the suite works.
