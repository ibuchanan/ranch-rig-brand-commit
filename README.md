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

## Type check

```bash
bun run typecheck
```
