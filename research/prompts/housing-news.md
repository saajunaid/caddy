# Task: Irish Cost Rental news, last 30 days

You are a research agent working for one household in Ireland that is looking for a **Cost Rental**
home (3-bed house or 4-bed home), with **Limerick** as its first priority but alerts for all of
Ireland. Your output is stored in their private app, Caddy, and shown next to the official listings.
Accuracy matters more than volume: **an empty list is a valid answer; an invented item is not.**

## What to find

News and announcements **published in the last 30 days** (relative to today's date in
Europe/Dublin) about Irish Cost Rental housing:

1. New Cost Rental schemes or developments announced, approved or completed.
2. Application windows opening or about to open (dates, provider, where to apply).
3. **Limerick pipeline**, including but not limited to the St Joseph's Hospital site and
   The Gasworks / Dock Road. Report what the source says about tenure; never assume Cost Rental.
4. Delivery by the **Land Development Agency (LDA)**, approved housing bodies (Clúid, Respond,
   Tuath, Co-operative Housing Ireland, Oaklee and others) and local authorities.
5. Planning decisions (granted, refused, appealed) for developments that include Cost Rental.
6. Allocations and lottery outcomes, including how many applied.
7. Eligibility changes: income limits, rent levels, rules on who can apply.

## Sources, in order of preference

1. **Official**: gov.ie (Department of Housing), the Housing Agency, the LDA, local councils
   (e.g. limerick.ie), An Coimisiún Pleanála / planning portals, newstarterhomes.ie.
2. **Provider**: the approved housing body or landlord delivering the homes.
3. **News**: established Irish outlets (RTÉ, The Irish Times, Irish Independent, Limerick Leader,
   Limerick Post, regional papers).
4. **Social** posts (X, Facebook, LinkedIn, forums) are **leads only**: always
   `"verification": "unverified"`, and never the only basis for anything else.

## Rules

- **Never invent.** Every item must come from a page you actually opened. Use the page's own URL
  (no search-result or tracking links). Copy facts; don't infer numbers, dates or tenure.
- Unknown values are `null` (e.g. no publication date shown → `"published_on": null`).
- `cost_rental_confirmed`: `"yes"` only when an **official or provider** source says the homes are
  Cost Rental; `"no"` when it says they are not (e.g. social or affordable purchase only);
  otherwise `"unconfirmed"`.
- `verification`:
  - `officially_confirmed` — the item's own source is official (`source_type: "official"`).
  - `corroborated` — reported by two or more independent non-official sources.
  - `reported` — one news or provider source.
  - `unverified` — a lead (all social posts), or anything you could not check.
  - `contradicted` — sources disagree; say how in the summary.
- `summary`: two or three factual sentences from the source. No speculation, no advice.
- `locality`: the town or area the item is about (e.g. "Limerick City", "Castletroy").
- One item per distinct story; prefer the official source when several cover the same thing.
- At most 30 items. Skip anything older than 30 days unless it is the official source for a
  story that broke in the last 30 days.

## Output

Output **only** a JSON object (no prose, no Markdown fences) that validates against
`research/schema/research-result.json`:

```json
{
  "topic": "housing",
  "agent": "claude-code-routine",
  "run_started_at": "2026-10-21T05:30:00+01:00",
  "items": [
    {
      "title": "…",
      "url": "https://…",
      "source_name": "…",
      "source_type": "official | provider | news | social | unknown",
      "published_on": "YYYY-MM-DD or null",
      "summary": "… or null",
      "locality": "… or null",
      "provider": "… or null",
      "cost_rental_confirmed": "yes | no | unconfirmed",
      "verification": "officially_confirmed | corroborated | reported | unverified | contradicted"
    }
  ]
}
```

Set `agent` to the runner you are (e.g. `claude-code-routine`, `gemini-cli`, `ollama:<model>`) and
`run_started_at` to when you started, with a timezone offset. Every field is required; use `null`
where a value is unknown. The server rejects `officially_confirmed` without an official source,
social items that aren't `unverified`, and `cost_rental_confirmed: "yes"` from news or social
sources.
