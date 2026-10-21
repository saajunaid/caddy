# Research contract (housing news)

Caddy shows Irish Cost Rental news next to the official listings. The app never calls an AI model
itself (PLAN D12). Instead, any research agent can run on a schedule and hand Caddy a JSON file.
The contract is three things:

| Part | File |
|---|---|
| Task prompt | [`prompts/housing-news.md`](prompts/housing-news.md) |
| Output schema (JSON Schema 2020-12) | [`schema/research-result.json`](schema/research-result.json) |
| Ingest endpoint | `POST https://caddy-beryl.vercel.app/api/ingest/research` |

The schema is generated from the Zod schema in `src/modules/housing/server/research.ts`
(`node --experimental-strip-types scripts/research/build-schema.ts`); a unit test fails if they drift.

## Sending a result

Write the agent's JSON to a file, then:

```sh
APP_URL=https://caddy-beryl.vercel.app INGEST_TOKEN=… \
  node --experimental-strip-types scripts/research/ingest.ts result.json
```

The script validates the file locally first and prints clear errors (`--check` validates without
sending). In a Claude Code cloud session, leave `INGEST_TOKEN` unset: the environment's network
secret for `caddy-beryl.vercel.app` adds the `Authorization` header, so the agent never sees the token. The endpoint:

- accepts `Authorization: Bearer <token>` where the token is the Supabase secret key, or a separate
  `RESEARCH_INGEST_TOKEN` if one is set in Vercel (recommended, so the agent never holds the
  database key);
- rejects anything that doesn't match the schema with HTTP 400 and a list of issues;
- upserts items by URL (re-sending an item updates it; identical items are ignored);
- records a `housing-news` background job run with the count, so the Housing page can say
  "News: no update since …" when nothing arrives for 36 hours. Re-posting the same
  `agent` + `run_started_at` is a no-op;
- sends an in-app alert (and push) only for items that are officially confirmed or about Limerick,
  once per URL.

An empty `items` array is a valid "nothing new"; a run that never arrives is shown as stale, never as
"no news".

## Runners

### Claude Code routine (current)

Create a daily routine in claude.ai/code on this repository (for example 06:30 Europe/Dublin) with
network access to news and official sites plus the app domain, the secret `INGEST_TOKEN`, and this
prompt:

> Read `research/prompts/housing-news.md` and follow it exactly. Write the JSON to
> `/tmp/housing-news.json`. Then run
> `APP_URL=https://caddy-beryl.vercel.app node --experimental-strip-types scripts/research/ingest.ts /tmp/housing-news.json`
> and fix and resend if it reports schema errors. Don't commit anything.

### Gemini CLI (check the current flags when you set it up)

```sh
gemini -p "$(cat research/prompts/housing-news.md)" > /tmp/housing-news.json
node --experimental-strip-types scripts/research/ingest.ts /tmp/housing-news.json
```

In GitHub Actions this needs a Gemini API key secret (consumer logins don't work in CI). Check the
auth model when you switch.

### Local model (Ollama, LM Studio, …)

A local model needs a search/browse tool to find sources; without one it can only make things up,
so don't run it bare. With a tool-using wrapper, pass the prompt file as the task, save the JSON
and run the same ingest script. Use `"agent": "ollama:<model>"` so runs are traceable.

## Checking what arrived

- Housing page → "Cost Rental news" panel (last 30 days, newest first).
- Settings → Background jobs → "Housing news" shows the last run and its count.
