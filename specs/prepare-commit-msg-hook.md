# brand-commit: a `prepare-commit-msg` hook that generates commit messages via Rovo

Status: draft

> **Verification.** Every behavioural claim below was checked empirically against
> git 2.56.0 and lefthook 2.2.1 in throwaway repositories, not recalled from
> memory. Claims that came from prior art (`aicommits`, `OpenCommit`) were
> checked and several did **not** survive. Findings that contradict the proposed
> design are recorded verbatim in "Corrections to the Prior-Art Synthesis".

## Problem Statement

Writing a good commit message is tedious and easy to skip, so messages end up as
`fix` or `updated stuff`. The _content_ of the change is already sitting in the
staged diff; the only missing step is a competent human reading it and writing
one sentence about it. In an automated agent loop that step is worse — an agent
calling `git commit` with no message launches the default editor and hangs
indefinitely waiting on stdin, because nothing ever supplies a message.

We want commit messages that describe the change accurately and consistently, at
the moment the commit is made, without a human having to stop and write them.

## Solution

A single compiled binary, `brand-commit`, wired into lefthook's
`prepare-commit-msg` hook. On a bare `git commit`, it captures the staged diff,
excludes generated and noisy files, caps its size, asks Rovo for a commit message
using the `git-commit` skill that encodes the organisation's subject and message
rules, sanitizes the response, and writes it into the commit message file. The developer sees a pre-filled message in their editor and can accept or
edit it. An agent running `GIT_EDITOR=true git commit` gets a non-interactive
commit with a real message.

When there is nothing to describe — no staged diff, or a diff entirely removed by
the exclusion filters — it does nothing and the commit proceeds as normal.

When the tool _is_ asked for a message and fails to produce a usable one, it stops
the commit and says why, rather than letting a commit through with an empty or
fabricated message. `git commit -m "..."` remains the escape hatch while the tool
is broken, since it bypasses the hook entirely.

## User Stories

### Direct mode — a developer at the shell

1. As a developer, I want the generated message pre-filled in my editor, so that I can review and edit it before it is committed.
2. As a developer, I want to be able to bypass the tool entirely when it is broken, so that a bad deployment does not lock me out of committing.
3. As a developer, I want a missing message file reported as a misconfiguration, so that I can fix the hook rather than guess why it failed.
4. As a developer, I want the abort to leave the repository exactly as it was, so that a failed commit leaves no partial state.

### Assisted mode — an AI coding agent driving `git commit`

This is the primary mode. The agent stages files and runs `git commit` through a
Bash tool; the tool generates the message from whatever the agent staged.

5. As an AI coding agent, I want a commit message generated from my staged changes, so that I do not have to compose one myself.
6. As an AI coding agent, I want `git commit` to complete without opening an interactive editor, so that my commit does not hang forever waiting on stdin.
7. As an AI coding agent, I want a non-empty message written when I pass none, so that `GIT_EDITOR=true git commit` produces a valid commit.
8. As an AI coding agent, I want the message derived from exactly what I staged, so that my commit is described accurately without me re-describing it.
9. As an AI coding agent, I want to pass the Jira issue key that motivates my work, so that the commit is traceable to the ticket.
10. As an AI coding agent, I want to set the issue key without changing how I invoke `git commit`, so that passing context does not alter my normal command.
11. As an AI coding agent, I want the issue key to reach the tool even though each of my Bash calls runs in a fresh shell, so that context I set is not silently lost between calls.
12. As an AI coding agent, I want to be told when a stale issue key from a previous commit is still present, so that I do not attribute this change to the wrong ticket.
13. As an AI coding agent, I want the tool to clear its own scratch state after each commit, so that no context leaks into the next one.

### Commit message format

14. As an AI coding agent, I want the subject line written to my organisation's commit rules, so that our history matches our conventions.
15. As an AI coding agent, I want those rules to live in one place I can update without changing this tool, so that a policy change is not a code change here.
16. As an AI coding agent, I want the message to describe what the change _does_, so that the history is useful when read later.

### Commit-source dispatch

17. As an AI coding agent, I want no message generated for `git commit -m "..."`, so that a message I wrote deliberately is never overwritten.
18. As an AI coding agent, I want no message generated for `git commit -F file`, so that a message read from a file is respected.
19. As an AI coding agent, I want no message generated for `--amend`, so that the original commit message and its authorship survive an amend.
20. As an AI coding agent, I want no message generated for `git merge`, so that Git's deterministic merge message is not clobbered.
21. As an AI coding agent, I want no message generated for a squash, so that Git's synthesized message is preserved.
22. As an AI coding agent, I want no message generated for `git commit -t template`, so that my template is used as-is.
23. As an AI coding agent, I want generation to happen for a bare `git commit` with no message flag, so that this is the only path that triggers the tool.
24. As reviewer, I want the tool to act only when the commit source is genuinely absent, so that a literal unfilled placeholder is never mistaken for a real source value.

### Diff capture

25. As an AI coding agent, I want the message generated from the staged diff rather than the working tree, so that the message reflects exactly what I am committing.
26. As an AI coding agent, I want lockfiles excluded, so that a dependency bump does not dominate the message.
27. As an AI coding agent, I want build output and generated assets excluded, so that a build artifact commit does not produce a nonsense message.
28. As an AI coding agent, I want binary files excluded, so that the prompt is not polluted with unreadable bytes.
29. As an AI coding agent, I want the diff capped at a fixed size, so that committing a vendored directory does not hang or bill an enormous prompt.
30. As an AI coding agent, I want to be told when the diff was truncated, so that I can judge how much to trust the message.
31. As an AI coding agent, I want no message generated when nothing is staged, so that `--allow-empty` commits do not get a fabricated description.
32. As an AI coding agent, I want the tool to detect that the exclusion filters removed everything, so that a lockfile-only commit is skipped rather than passed to the model as empty.

### Sanitizing model output

33. As an AI coding agent, I want markdown code fences stripped, so that the commit subject is not ` ```text `.
34. As an AI coding agent, I want wrapping quotes stripped, so that the subject is not `"feat: add thing"`.
35. As an AI coding agent, I want conversational preamble stripped, so that the subject is not `Here is your commit message:`.
36. As an AI coding agent, I want a multi-line fenced response stripped on _both_ fences, so that the trailing fence does not leak into the body.
37. As an AI coding agent, I want output that is still unusable after sanitizing discarded, so that garbage never reaches my history.
38. As an AI coding agent, I want empty or whitespace-only output to leave my message file untouched, so that I fall back to writing it myself.
39. As an AI coding agent, I want a written message file to end with exactly one newline, so that repeated runs do not keep changing it.

### Failure behaviour

40. As an AI coding agent, I want a Rovo failure to abort my commit with a clear reason, so that I never commit with a silently missing or fabricated message.
41. As an AI coding agent, I want Rovo's raw error output suppressed, so that a stack trace does not obscure the actionable reason.
42. As an AI coding agent, I want a one-line explanation on stderr naming the actual cause, so that I can tell a timeout from a bad model response.

### Invocation surface

43. As an AI coding agent, I want the binary named exactly `brand-commit`, so that it is short to type in a hook config.
44. As an AI coding agent, I want the binary to need no runtime installed, so that it works on a machine without a JS toolchain.
45. As an AI coding agent, I want `--help` and `--version`, so that I can read the contract without reading the source.
46. As an AI coding agent, I want the tool to work from any working directory, so that the hook config stays simple.
47. As an AI coding agent, I want the model used to be selectable, so that I can trade cost against quality.
48. As an AI coding agent, I want the prompt to instruct a raw-text-only response, so that the model does not narrate.

## Implementation Decisions

### Correction to the skip rule — the central decision

**The proposed skip logic is inverted, and as written it disables the tool
entirely.** Verified: lefthook does **not** elide a missing `{2}`. When git
invokes the hook with a single argument, lefthook passes the literal four
characters `{2}` as the second argument. The tool therefore receives a
non-empty `$2` on _every_ invocation, and `if [ -n "$COMMIT_SOURCE" ]; then exit
0; fi` skips in all cases — including the one case we want. Reproduced end to
end:

- bare `git commit` → tool receives `$2=[{2}]` → snippet skips → **no message ever generated**
- `git commit -m x` → tool receives `$2=[message]` → snippet skips → correct, by accident

**Corrected dispatch.** Do not test for emptiness. Enumerate the sources git
actually passes and act only on the one that means "no message supplied":

- Act only when `$2` is exactly the literal placeholder `{2}` (the lefthook
  signature of "git passed no source"), or when the argument is absent or empty
  and the tool is invoked directly.
- Skip when `$2` is any of `message`, `template`, `merge`, `squash`, `commit`.
- **Fail loudly on any other value.** A literal placeholder is a known condition;
  an unrecognised value means the invocation contract has changed underneath us
  and silently guessing is how commits get corrupted. Treat it as an error.

Verified source-to-behaviour matrix (git 2.56.0), which the corrected rule keys off:

| Invocation                           | git passes                   | Should generate     |
| ------------------------------------ | ---------------------------- | ------------------- |
| `git commit` (bare)                  | _(no 2nd arg)_               | **yes**             |
| `git commit --allow-empty` (no `-m`) | _(no 2nd arg)_               | no (nothing staged) |
| `git commit -m x`                    | `message`                    | no                  |
| `git commit -F file`                 | `message`                    | no                  |
| `git commit -t tpl`                  | `template`                   | no                  |
| `git commit -t tpl -m x`             | `message`                    | no                  |
| `git commit --amend` (reuse msg)     | `commit` (+ 3rd arg `HEAD`)  | no                  |
| `git commit --amend -m x`            | `message`                    | no                  |
| `git merge`                          | `merge` (+ `.git/MERGE_MSG`) | no                  |

Note two entries that contradict intuition: `--amend -m x` reports `message`, not
`commit`, and `-t tpl -m x` reports `message`, not `template`. Both are still
skipped correctly, but only because the corrected rule skips both values.

### Non-zero exit aborts the commit — verified, and it constrains all failure handling

Verified: git treats any non-zero exit from `prepare-commit-msg` as fatal. A hook
exiting 1 or 2 left the repository at zero commits. There is no "warn and
continue" — the developer gets no commit at all.

This makes the exit code the tool's primary control surface, and it means the
exit-0 and exit-nonzero paths must be chosen deliberately rather than by default.
The rule adopted here:

- **Exit 0** when doing nothing is the _correct_ outcome — no diff, diff
  fully excluded by filters, commit source indicates a message already exists.
- **Exit non-zero** when the tool was asked for a message and failed to produce
  one — Rovo timeout, Rovo non-zero exit, unusable output, unreadable message
  file, unrecognised commit source.

This supersedes the prior-art synthesis, which called for exit 0 on all model
failures to "fall back to a manual commit prompt". That advice is wrong here for
two reasons: it cannot distinguish a transient failure from a broken
configuration, so the developer gets an empty editor and no explanation; and the
manual-prompt fallback does not exist in the non-interactive path. See "Failure is
abort, not silent fallback" below.

### Failure is abort, not silent fallback

**Decision: when the tool cannot produce a message, it exits non-zero and the
commit is aborted.** This is a deliberate choice by the developer, on the
reasoning that the case — model failure with no human present at an editor — is
not expected to arise in practice, and that a clear failure beats a silent
degraded commit.

Verified consequence: a non-zero exit from `prepare-commit-msg` aborts the commit
outright, leaving the repository unchanged. So "abort" is a real stop, not a
warning that scrolls past.

This is the opposite of the graceful-degradation posture in the prior-art
synthesis, and the trade is worth stating plainly: **the tool becomes a hard
dependency on Rovo availability for every bare `git commit`.** During a Rovo
outage nobody commits without a message. That is acceptable here because the
bypass in the next decision is cheap and obvious.

The abort must therefore be _legible_. The developer needs to distinguish "Rovo
timed out" from "Rovo returned something unusable" from "the hook is
misconfigured", because the remedy differs in each case. One concise line on
stderr naming the cause, not a stack trace and not raw subprocess output.

**What still exits 0.** Only the paths where doing nothing is the _correct_
outcome, not a failure:

- Nothing staged — there is nothing to describe, so no message and no error.
- Diff present but entirely removed by exclusion filters — same reasoning.
- Commit source indicates a message already exists — the tool does not apply.
- Output empty or whitespace-only after sanitizing.

The last of these is the debatable one. An empty response is a model failure
wearing a success exit code, and silently falling through to an empty editor is
the confusing outcome this decision exists to prevent. It is listed here as
exit-0 only because it is currently indistinguishable from "Rovo had nothing to
say"; if that ambiguity proves annoying in practice, promoting it to an abort is
a one-line change.

### Bypass

Because aborting on failure makes the tool a hard dependency, there must be a
way to commit while it is broken. `git commit -m "..."` already is that bypass —
the commit source arrives as `message`, so the tool skips entirely. No new flag is
needed. The design simply depends on `-m` continuing to work, which the verified
dispatch matrix confirms.

A `BRAND_COMMIT_DISABLE` environment variable is included as a second, explicit
escape hatch for the case where lefthook is configured globally and an individual
developer needs to turn it off without changing the hook config.

### The `{2}` placeholder is a lefthook implementation detail

Keying behaviour on the literal string `{2}` is the only way to detect "no source
was passed" through lefthook, but it couples the tool to lefthook's templating
behaviour. Mitigation: accept a clean environment variable as an override, and
treat the placeholder detection as one narrow branch of a dispatch function rather
than logic smeared through the tool. If lefthook changes its placeholder syntax,
one function changes.

### Sanitization: what it must achieve, not how

A model asked for "just the text" reliably returns the text wrapped in something —
a markdown fence, surrounding quotes, or a line of preamble. Sanitization is the
step that turns that response into a message file. It is specified here by
**observable outcome**, because the mechanism is an implementation choice and this
tool is written in TypeScript running under Bun, where whole-string operations are
available and shell text-processing idioms are not.

The response is treated as a **single string, not a stream of lines**. That is the
substantive constraint: transformations must not depend on where line boundaries
fall. The shell idioms in the prior-art synthesis were line-anchored, so they
handled only a single-line backtick-wrapped answer and failed on the fenced block —
which is the *common* case. Verified against the proposed expressions:

| Model returns | Line-anchored processing yields |
| --- | --- |
| fence + `feat: add thing` + fence | `text` / `feat: add thing` / **leftover fence** |
| bare fence + subject + bare fence | **empty** / `feat: add thing` / **leftover fence** |
| `Here is your commit message:` + subject | **unchanged — preamble leaks** |

Required outcomes:

- A **matched leading and trailing fence pair** is removed entirely, including the
  info-string on the opening fence.
- **Whole-response quoting** is unwrapped when the entire message is quoted.
- A **conversational preamble** is removed, leaving the message itself.
- **Stray fences anywhere** in the remaining text are removed, so a trailing fence
  cannot survive the unwrapping.
- Leading and trailing **whitespace** is trimmed.

Then the result is **validated, not trusted**. Anything still containing a fence,
still opening with conversational phrasing, empty, or exceeding the length ceiling
is rejected — and rejection means the commit aborts, per the failure policy. The
point of validating is that sanitization is best-effort by nature: silently writing
a half-cleaned message is worse than stopping.

The length ceiling is the one piece of shape logic that stays here, and only
because validation needs *some* bound to reject against. It is not a statement
about how subjects should be written — that is the `git-commit` skill's business.

What sanitization must **not** do: impose or check message format. It strips
wrapping and rejects unusable output; it does not know what a well-formed subject
looks like. See the next decision.

### Message format is owned by the `git-commit` skill, not by this tool

The organisation's subject-line and message-body rules — Conventional Commit shape,
the Jira issue key in the first line, subject length, when to include a body — live
in a **`git-commit` skill**. The tool's prompt asks Rovo to use that skill, so the
rules are applied at the point of generation and can change without a code change
here.

This removes from this spec everything about message _shape_: there is no
conventional-commit validation, no 72-character rule, no "bullets for large
diffs" heuristic. Those were previously specced here and are now explicitly
out of scope.

Two consequences:

- **The tool does not parse or enforce the format.** Sanitization stays shape-
  agnostic — it strips fences and preamble, and rejects only what is unusable.
  If the skill changes tomorrow, nothing in this tool needs to know.
- **The ticket key is the skill's business, not the tool's.** The tool's job is to
  _supply_ the key as context; the skill decides how to place it. The
  `fix(bug): JRA-123 stop the memory leak` shape is therefore an example of what
  the skill produces, not a format this tool hard-codes.

The prompt still needs a thin layer of its own: the diff, the ticket key, the
measured size, and the instruction to return raw text with no fences or
preamble. That is request assembly, not format policy.

### Passing the ticket key: why an environment variable alone is not enough

The agent does not invoke the tool, so the only channels available are things
that cross the `git commit` → lefthook → `brand-commit` boundary. I tested four
candidates against real lefthook 2.2.1 and git 2.56.0, simulating the agent's
one-shell-per-Bash-call behaviour:

| Channel                                                                       | Reaches the tool?               |
| ----------------------------------------------------------------------------- | ------------------------------- |
| Env var set inline on the same call: `BRAND_COMMIT_TICKET=JRA-303 git commit` | **yes**                         |
| Env var exported in an earlier Bash call                                      | **no — lost with the shell**    |
| Branch name (`jra-102-memory-leak`)                                           | not read by the tool as written |
| Sidecar file under `.git/` written before the commit                          | **yes**                         |

**The env var does not survive between tool calls.** This is the crux: each agent
Bash call runs in a fresh shell, so `export BRAND_COMMIT_TICKET=...` in one call
is gone by the next. Verified — the commit-time tool saw `BRAND_COMMIT_TICKET`
as unset. An agent would have to prefix the variable onto the _same_ line as
`git commit`, which works but is easy to forget and invisible once forgotten.

**Decision: support both working channels.**

- **Inline env var on the same call** — primary. It is stateless, needs no
  cleanup, and cannot go stale. Documented as `BRAND_COMMIT_TICKET=JRA-123 GIT_EDITOR=true git commit`.
- **A sidecar file under `.git/`** — fallback for agents that would rather set
  context once and commit later.

The sidecar lives under `.git/` because git never tracks anything there.
Verified: the file does not appear in `git ls-files` and cannot leak into a
commit.

**The sidecar has a staleness hazard, which is why it is second.** Verified: the
file survives an aborted commit, so a failed commit leaves the key in place and
the next commit silently inherits it — attributing an unrelated change to the
wrong ticket. Mitigations:

- The tool **consumes** the sidecar — deletes it once used — so it cannot outlive
  the commit it was meant for.
- If a sidecar is present at generation time and older than the current commit
  attempt, that is a stale-key risk; the prompt is told to treat an unexpected
  key with suspicion, and the tool warns on stderr.

Branch-name encoding was not chosen: it couples the ticket to branch naming
convention, breaks when work is not on a ticket branch, and goes stale the moment
a branch is merged or renamed.

### Diff capture

**Exclusions are sound — verified.** The prior-art filter patterns correctly
reduced a staged set of `bun.lock`, `dist/b.js`, and `src/a.txt` to `src/a.txt`
alone. The exclusion *intent* is carried forward: lockfiles, build output,
generated assets, and binary content should not reach the model. The exact
pathspec syntax is an implementation detail and is not fixed here.

**"Untracked files" is the wrong reason for an empty staged diff.** Verified: a
newly-created file that _has_ been `git add`ed appears in the staged diff
normally. Files never staged do not appear — but in that case git aborts the
commit before the hook is reached, so the hook never sees that situation. The
real reasons an empty diff reaches the tool are `--allow-empty` with nothing
staged, or a commit whose entire content was excluded. Both are legitimately
"nothing to describe".

**Truncation must be visible — verified that it otherwise is not.** Capping a
406-line diff at 300 lines cut it mid-content with nothing marking the cut. The
model cannot tell it is seeing part of a change, and will describe only what it
received.

Required behaviour: the capture has a size ceiling, and **whenever the ceiling
bites, the model is told so** — either by an explicit marker in the prompt or by
supplementing the truncated body with a summary of the full change set. Silent
partial input is the failure mode to avoid; which of the two mitigations is used is
an implementation choice.

The tool must also distinguish "diff is empty" from "diff was empty after
exclusion", so a lockfile-only commit is skipped deliberately rather than
appearing to the model as an empty prompt.

### Model invocation

**Unverified — `rovo` is not installed on this machine and is not in Homebrew.**
The CLI surface, the model identifier, and the flags could not be checked and
should be confirmed against the installed CLI before implementation. The model
identifier in the prior-art snippet (`claude-3-haiku`) is an older name that may
be deprecated.

Two requirements regardless of what the CLI turns out to be:

- **The diff must reach the model without shell interpolation.** The prior-art
  approach of piping the diff through an `echo` in a shell command mangles
  backslashes and metacharacters, and a diff is exactly the kind of content that
  contains both. The diff is supplied as data.
- **Failures are distinguishable from empty output.** A timeout, a non-zero exit,
  and a legitimately empty response are three different conditions and the tool
  must be able to tell them apart to report the right cause.

Model selection is a parameter, not a constant, so the cost/quality trade can be
made per repository.

### The message file is edited, not overwritten

Git seeds the commit message file with a block of comment lines — the
instructional scaffolding the editor displays. Verified: wholesale replacement
destroys it, which removes the guidance a developer reads before committing.

Required behaviour: when the tool writes a message, it **replaces the message
portion and leaves the comment scaffolding intact**; when it has no usable
message, it leaves the file byte-identical. The mechanism — how the message and
comment regions are distinguished, and how the edit is applied — is an
implementation decision.

### Runtime and packaging

TypeScript on **Bun**, compiled to a single standalone executable named
`brand-commit`. The binary name is independent of the package name
(`ranch-rig-brand-commit`), and it is declared so installation places it on
`PATH`, letting the lefthook command invoke it by bare name.

Two properties matter more than the rest:

- **No runtime dependency at the consumer.** The binary runs on a machine with no
  JS toolchain installed, because it is a compiled artifact rather than a script
  that needs an interpreter present.
- **One documented build command.** Reproducing the artifact is a single step.

The hook logic lives in TypeScript under `src`, not in shell. This is not a
stylistic preference: several of the required behaviours above — whole-response
sanitization, distinguishing an excluded-everything diff from a genuinely empty
one, preserving comment scaffolding while replacing a message, passing a diff to a
subprocess without shell interpolation — are awkward or unsafe in shell and
straightforward in a real language. The process boundary, argument contract, and
exit-code semantics are specified; the internal decomposition is not.

## Testing Decisions

**What makes a good test.** Every test invokes the compiled binary as a
subprocess and asserts only on observable behaviour: exit code, contents of the
commit message file, and stderr. No test imports an internal function. If the
internals were rewritten entirely and observable behaviour held, tests should
still pass.

**One seam: the process boundary.** Message file in, message file and exit code
out — the same boundary git, lefthook, and a human at a terminal all use.

**The seam needs an override for the model call, and that is the one concession.**
Every test would otherwise make a real Rovo call, making the suite slow,
non-hermetic, network-dependent, and billing-incurring. So the LLM is a
substitutable dependency at the seam: a real binary is built for production, and
tests put a stub on `PATH` that returns canned model output. Tests then exercise
the _real_ binary — real argument dispatch, real diff capture, real
sanitization, real file writing — with only the network boundary replaced.

This is deliberately not a second seam. The alternative, exporting the pure
transform for unit tests, is rejected: a unit seam would let the suite pass green
while the dispatch and file handling around it — where this design has already
produced four separate bugs — were broken.

**The dispatch matrix is the highest-value test target.** It is where the design
is most likely to be wrong and where the failure is most destructive: acting when
it should skip silently discards a real commit message. Cover every row of the
verified matrix above, plus the literal `{2}` placeholder and an unrecognised
source value.

**Specific cases the corrected design must cover.**

- `{2}` placeholder → generates. `message`, `template`, `merge`, `squash`,
  `commit` → skips, file byte-identical, exit 0.
- Unrecognised source → non-zero exit, no write.
- Bare `git commit` end-to-end in a real temp repo with a stubbed model on
  `PATH`, asserting the final commit subject. This is the only test that proves
  the whole wiring, and it is the one that would have caught the inverted skip.
- `GIT_EDITOR=true git commit` with the stub failing → asserts the commit is
  **abandoned**, no commit is recorded, and the message file is unmodified.
- `GIT_EDITOR=true git commit` with the stub exiting non-zero → asserts the same
  abort, plus a stderr line naming the cause rather than the stub's raw output.
- `git commit -m "manual"` with the stub always failing → asserts the commit
  **succeeds**, proving the bypass still works when the tool is broken.
- `BRAND_COMMIT_DISABLE=1 git commit` with the stub failing → asserts skip.
- **Ticket key, inline env on the same call as `git commit`** → asserts the key
  reaches the stub's prompt.
- **Ticket key, env exported in a separate shell first** → asserts it does _not_
  reach the tool. This test pins the documented limitation so nobody later
  "fixes" the agent instructions to rely on it.
- **Sidecar file under `.git/`** → asserts the key is read **and the file is
  deleted afterwards**.
- **Stale sidecar** — file present, commit aborted → asserts the next commit sees
  no leftover key, or warns if one is still found.
- **Sidecar must never be committed** → asserts `.git/` contents stay untracked
  across a commit.
- Both channels unset → asserts no key is injected and no crash occurs.
- Sanitization: fenced block, unlabelled fence, quoted, conversational preamble,
  empty, whitespace-only, over-length.
- Sanitization stays shape-agnostic: a non-conventional subject passes through
  unmodified, since the tool does not own the format.
- Diff capture: staged untracked file **is** included; lockfile-only commit is
  skipped; truncation past the ceiling marks the truncation.
- Missing message file → non-zero exit.
- Comment scaffolding preserved when no message is written.

**Fixture discipline.** Each test gets its own temp repo and message file. No
shared fixtures, no ordering dependencies.

**Precondition.** Tests run against the compiled binary, so the build is a
prerequisite. Testing uncompiled sources would leave argument dispatch and file
handling — most of the program, and the source of every bug found here — untested.

**Prior art.** There is none; this repository has no existing tests. This
establishes the first suite: black-box, binary-level, one seam.

## Out of Scope

- **Writing or templating the consuming repository's `lefthook.yml`.** Documented
  as an example; not installed or generated.
- **Installing into `.git/hooks` directly.** lefthook owns this via
  `lefthook install` — verified necessary, since a `lefthook.yml` alone installs
  nothing.
- **Enforcing Conventional Commits as a gate.** Generation is not validation.
  A blocking checker belongs in `commit-msg`. The tool also does not _own_ the
  subject format — see the `git-commit` skill decision below.
- **Authoring or maintaining the `git-commit` skill.** The tool invokes it. Its
  contents live wherever the organisation keeps skills, and its rules change
  independently of this code.
- **Interactive selection among several candidate messages.** One message, edited
  in the editor if a human is present.
- **Per-repository prompt customization.** The prompt is a constant in this
  version; the model is a parameter.
- **Diffing beyond the staged set.** No unstaged, no branch, no range diffs.
- **Commit body generation beyond the short bullet form.** No ticket links, no
  co-author trailers, no changelog formatting.
- **CI integration, publishing, or release automation.**

## Corrections to the Prior-Art Synthesis

Recorded so the same mistakes are not re-imported later.

1. **The skip rule is inverted and disables the tool.** lefthook passes the
   literal `{2}` when git supplies no source, so `-n "$SOURCE"` is always true and
   the tool never runs. Reproduced in a real repo.
2. **A non-zero exit aborts the commit.** Verified with exit 1 and 2; the
   repository stayed at zero commits. "Exit gracefully with 0" is mandatory for
   every recoverable path, not merely advisable.
3. **Line-anchored stripping of model output fails on fenced blocks.** Verified:
   the shell expressions handled only a single-line backtick-wrapped answer and
   left a stray fence or leaked preamble on the common fenced-block response. The
   mechanism was wrong for the problem, independent of language — fixed here by
   requiring whole-response handling, not by a different expression.
4. **"Untracked files" is the wrong reason for an empty staged diff.** Staged
   untracked files appear normally in the diff. Verified.
5. **The exclusion intent is correct** — filtering lockfiles and build output was
   verified working. Carried forward as intent, without pinning the syntax.
6. **Capping a diff silently truncates it mid-content.** Verified: a 406-line diff
   cut at 300 lines carried no marker, so the model cannot tell it sees part of a
   change.
7. **Replacing the message file wholesale destroys Git's comment scaffolding.**
   The editor guidance the developer relies on is lost.
8. **"Exit gracefully with 0 so Git falls back to a manual prompt" is wrong
   advice here.** Verified: `GIT_EDITOR=true` with an empty message file aborts
   outright, so there is no manual prompt to fall back to in the non-interactive
   path, and an exit 0 gives the developer an empty editor with no explanation.
   The prior-art recommendation is superseded by the abort decision.
9. **Passing the diff through shell interpolation is unsafe** — backslashes and
   metacharacters in a diff are mangled. The diff must reach the model as data.
10. **`rovo` is unverified** — not installed, not in Homebrew, and the
    `claude-3-haiku` identifier may be stale.

## Further Notes

- **The `{2}` placeholder coupling is the weakest point in the design.** Detection
  of "no commit source" through lefthook currently depends on a string that is a
  templating implementation detail, not a documented contract. Worth an
  explicit environment-variable override from day one, and worth watching lefthook
  release notes. The verified matrix above is the thing to re-run after any
  lefthook upgrade.

- **Assisted mode is now primary**, per the developer. This shifted emphasis
  throughout: dispatch, failure, and diff-capture stories are written from the
  agent's perspective, and direct mode is reduced to the human-at-an-editor
  moments that genuinely differ (reviewing a pre-filled message, fixing a
  misconfigured hook).

- **The ticket-key channel is the main open design risk.** Env vars do not
  survive between agent Bash calls — verified — so the inline form
  `BRAND_COMMIT_TICKET=JRA-123 git commit` is the primary path and is easy for
  an agent to omit. If agents routinely forget it, the better answer is a
  persistent source the agent already maintains (a branch convention or a file
  in the working tree), not a more memorable env var. Worth revisiting after
  real assisted-mode use.

- **Whether the sidecar file is even needed is unproven.** It exists as a
  fallback because the env var is easy to forget. If inline vars prove reliable
  in practice, the sidecar — and its staleness hazard — should be deleted
  rather than maintained.

- **The `git-commit` skill invocation is unverified.** Confirm that Rovo's CLI
  can invoke a named skill from a programmatic prompt, and how the skill is
  identified. This is a dependency on an unconfirmed capability; if Rovo cannot
  invoke skills this way, the rules must be inlined into the prompt after all.

- **Message format is deliberately not specced here.** Anything found wanting —
  subject length, body structure, issue-key placement — belongs in the
  `git-commit` skill, not here.

- **`GIT_EDITOR=true` plus an empty message aborts the commit.** Verified. Under
  the abort decision this is now consistent rather than hazardous: the tool
  either writes a message or the commit stops, and a stopped commit is the
  intended behaviour on failure. It stops being a hazard only for the paths that
  must succeed regardless — nothing-staged, and message-already-supplied.

- **`--amend -m` reports `message`, not `commit`.** Verified. Any future logic
  that wants to distinguish amends by source value will not work; if amend
  detection is ever needed it must inspect the third argument, which is present
  only for the amend path.

- **Model invocation is unverified.** `rovo` is not on this machine. Confirm the
  real command surface, the current model identifier, and auth before committing
  to the design.

- **The prior-art claim that was verified as sound** — the `:(exclude)`
  pathspec filtering — is carried into this spec. The formatting prescriptions
  (subject length, Conventional Commit shape, body style) are **not**; they now
  belong to the `git-commit` skill. See that decision.

- **Not yet published to a tracker.** No git remote and an invalid `gh` token.
  Run `/setup-matt-pocock-skills`, then file as an issue labelled
  `ready-for-agent`.

- **Still outstanding from earlier:** `README.md` references
  `bun run index.ts`, which no longer resolves after the entrypoint moved into
  `src`.
