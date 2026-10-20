# Caddy — rules for Claude Code sessions

Caddy is a private household PWA (Irish household, two adults). Read `docs/PLAN.md` before starting any task; it overrides `SPEC.md` where they differ.

@AGENTS.md

## Commands
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`, `pnpm build`. Run all of them before pushing (`pnpm check` runs the first four).
- Pin exact dependency versions, at least two weeks old.

## Working style
- One task (plan ID, e.g. `1.4`) per session and per draft PR. Don't start the next task or release.
- Before pushing: run lint, typecheck, unit tests and build (and `pytest`/`ruff` for `worker/` changes). Push only when clean.
- Keep PRs small and in scope. Note anything out of scope in the PR description instead of fixing it.
- Update `docs/PLAN.md` if a decision changes, and record why.

## Non-negotiables
- **No invented facts.** Unknown stays `null`/"Unknown". Every displayed fact has a provenance (`official | provider | osm | google | estimate | user | ocr-proposed`).
- **Failure ≠ zero results.** Every job writes a `job_runs` row with per-source status. A page that loads but parses zero listings is a failure.
- **Jobs never overwrite user-owned fields** (application status/outcome/notes, confirmed document fields, preferences). Test it.
- **No AI/LLM calls in the app runtime.** Document extraction = text layer → OCR → rule-based parsers → *proposed* fields the user confirms.
- **Never act on the user's behalf:** no applying, booking, switching supplier, sending correspondence or filing tax.
- **Money:** `numeric` in Postgres, integer cents or a decimal library in TS. Never floats. Never add different currencies without a dated FX rate.
- **Dates:** store UTC `timestamptz`; date-only values as `date`; compute "today" in `Europe/Dublin`. Utility comparison is due exactly 14 calendar days before contract end, never monthly.
- **Security:** RLS on every table, scoped to `household_id`. Service-role key only in GitHub Actions secrets and server-only modules (`import "server-only"`). Private storage bucket + short-lived signed URLs. Never log secrets, account numbers or document text.
- **Never commit real household data or real bills.** Fixtures are synthetic or redacted.
- **Scraping etiquette:** respect robots.txt/terms, ~1 req/s, identifying User-Agent, no bypassing bot protection.
- Domain logic in `src/server/domain` is pure (no I/O) and unit-tested.

## UI
- Follow `docs/PLAN.md` §8 and the approved prototype in `docs/design/`.
- Dracula (dark) / Alucard (light) tokens via CSS variables. Accent colours carry meaning (green new/open, orange due soon, red failed/closed, yellow needs review/estimate, purple primary, cyan links, pink user picks).
- Every screen works at phone and desktop widths, has empty/loading/error/offline states, and meets WCAG AA contrast.
