# Fix packages

Step-by-step fix packages for issues found after a work package shipped. Same
format as `doc/plan/`: numbered tasks with Goal / Files / Approach /
Dependencies / Acceptance criteria / V&V / Pitfalls.

Work fix packages in strict order within a file. Run global V&V
(`pnpm lint && pnpm typecheck && pnpm build && pnpm test`) after each package.

| File | Fix package | Tasks |
| --- | --- | --- |
| `01-break-derivation-fixes.md` | FX1 — Break derivation correctness | 7 |
|