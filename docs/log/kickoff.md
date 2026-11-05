# Time log: kick-off (wave 0, hour one preparation)

Real clock, Helsinki. Coordinator: Fable; coding agent: Opus.

| When             | What                                                                                                                                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-05 16:35 | Fork cloned at `33ab594`, tree clean. Read `CHALLENGE.md`, `RULES.md`, `data/DATA.md`, the scripts, hooks, CI, the skeleton's domain, server and i18n code.                                                                                                                                                          |
| 17:05            | Practice repo cloned read-only beside the fork: `C:/Git/leasing-platform` at `8335e31`.                                                                                                                                                                                                                              |
| 17:10            | Johannes: coding agents run on Opus, Fable only coordinates (D18). Meta-rule tests delegated to an Opus agent: `tests/meta-rules.test.ts` + `tests/**` in the Vitest include (D19).                                                                                                                                  |
| 17:15            | Docs written: `docs/kickoff-brief.md` (the brief, verbatim plus a locator note), `docs/decisions.md` (D1–D20; D18 and D19 decided, the rest proposed for hour one), `docs/stack-notes.md` (the ported traps), the team section of `AGENTS.md`, the README pointer.                                                   |
| 17:24            | Johannes: check that CI works. Found: the fork is `ThomasParratt/northfina-lease-loop`, Actions are enabled (workflow `CI` active since 17:22), no run yet; the account on this machine (`Tonttu84`) has read access only, so it cannot push; Node is not installed on this machine at all (`.nvmrc` wants 22.22.2). |
| 17:30            | The winget install of nvm-windows was blocked by the agent's permission mode; left to Johannes. `npm run check:all` not run; the two commits (`test(meta)`, `docs(kickoff)`) wait for Node.                                                                                                                          |

## Blocked

- **Node 22.22.2** on this machine: `winget install CoreyButler.NVMforWindows`, then `nvm install 22.22.2 && nvm use 22.22.2`, then `npm ci && npm run db:setup`.
- **Push access**: Thomas adds `Tonttu84` as a collaborator on the fork (README, "Submitting", step 1). Until then every commit stays local.
- **First CI run**: happens on the first push after the collaborator fix. Watch it; the workflow has never run on the fork.

## Left undone

- Wave 0 proper: (a) the schema and the seed with `Customer` and the "continue as" picker; (b) the event payloads, the route table, the OpenAPI generator, `fast-check`; (c) the base pages (nav, demo page shell with the clock override, audit page) and their message keys. Each is a brief of its own, from the template in `docs/kickoff-brief.md` section 11.
- The two mentor questions (D8 quantity, D16 pass-on) are not asked yet.
- D1–D17 and D20 are proposed, not decided: confirm them in hour one and flip the status column.
- Prettier has not been run on the new Markdown (`format:check` covers `.md`): run `npx prettier --write docs AGENTS.md README.md` before committing.
