# Money: bills, documents and Irish tax evidence

Owner paths: `src/modules/money/documents/`, `src/modules/money/tax/`, `src/app/(app)/money/`
(except `money/utilities/`), migration `supabase/migrations/20261021300000_documents_tax.sql`,
DB tests `tests/db/money-documents.test.ts`, fixtures `tests/fixtures/bills/`.

## What it does

- **Bills tab** (`/money`): "Add bill or receipt" (file or phone camera), the review queue first
  (yellow), then recent confirmed documents. Links to household spending.
- **Review** (`/money/bills/[id]`): the original (PDF in an `<object>`, images inline, via a
  5-minute signed URL) beside the proposed fields with confidence bars, Confirm / Edit per field,
  "Confirm all", and "Use this bill for": household spending (creates or updates one expense) and
  tax evidence (tax year, category, people and their share). Saving confirms every value and marks
  the document `confirmed`.
- **Spending** (`/money/expenses`): category filter, list (table on desktop) and monthly totals.
- **Tax** (`/money/tax`, `/money/tax/[year]`): per-adult remote working relief worked through step
  by step, estimated tax back at 20% and 40% (labelled estimates), evidence checklist by month,
  WFH days per month per adult, employer allowance (D), the rule version and Revenue link.
  Exports: `/money/tax/[year]/export.csv` and a printable summary at `/money/tax/[year]/print`.
- **Money shell** (`money/layout.tsx`): the "Money" header and Bills · Tax · Utilities tabs. Pages
  under `/money` (including the Utilities module's) render below it and should not add another
  `<h1>`.

## Upload flow

```text
browser                                   server action / storage
───────                                   ───────────────────────
pick file (PDF, JPEG, PNG, HEIC, WebP ≤20 MB)
SHA-256 (Web Crypto)  ─────────────────▶  startUploadAction: household check, duplicate check
                                          (unique household_id+sha256), documents row
                                          review_status = 'processing', path
                                          <household>/<document>/<safe-name>
createSignedUploadUrl (storage RLS insert)
PUT file with XHR (progress bar)  ─────▶  private bucket household-documents
extract text on the device:
  PDF → pdf.js text layer (all pages, ≤30)
  scanned PDF (thin text layer) → render ≤4 pages → Tesseract OCR
  photo → downscale to 2400 px → Tesseract OCR (English, CDN language data)
  HEIC the browser can't open → no text, user types details
finishUploadAction(text ≤150k chars) ──▶  file present? → deterministic parsers → proposed fields
                                          document_extractions row; documents columns filled
                                          (never touching confirmed fields); 'needs_review';
                                          job_runs "bill-reader" with per-source status;
                                          notification "Bill ready to review: <supplier> <period>"
                                          (dedupe document-ready:<id>), push flushed
open /money/bills/<id>
```

If the browser closes mid-way, the daily **`documents-sweep`** job (registered in
`src/server/jobs/registry.ts`) finds documents still `processing` after 2 hours: if the file
arrived it moves them to `needs_review` (with an empty "not read" extraction and the same
notification); if it never arrived it deletes the empty record. It never touches reviewed fields.

A run where no text was read, or no field was recognised, records a **failed** source in
`job_runs` ("Failure ≠ zero results"); the document still goes to review for manual entry.

## Parsers (`src/modules/money/documents/server/parsers/`)

Pure TypeScript, Node-runnable (relative `.ts` imports), no AI.

- `values.ts`: amounts (2 decimals, €/EUR, minus or `CR`; ignores rates, %, kWh, dates),
  Irish day-first dates in several styles, kWh (explicit, or from previous/present meter readings
  when present − previous = used), unit rates (`37.12c`, `€0.3712/kWh` → cent per kWh, exact
  decimal strings), percentages, masked identifiers (account, MPRN, GPRN: last four only) and
  snippet redaction (runs of 7+ digits masked).
- `suppliers.ts`: detection by name and printed web domain. Energy: Electric Ireland, SSE
  Airtricity, Energia, Bord Gáis Energy, Flogas, Pinergy, PrePayPower, Yuno Energy, Community
  Power, Ecopower. Broadband/phone: Eir, Virgin Media, Vodafone, Sky, Three, Pure Telecom, Digiweb.
  Receipts: Tesco, Dunnes Stores, Lidl, Aldi, SuperValu. "Sky" and "Three" need a qualifier
  ("Sky Ireland", "three.ie") because they're ordinary words. Two suppliers with similar scores →
  no supplier, all offered as choices.
- `profiles.ts`: label wording per field group. Three tiers, first hit wins:
  1. the supplier's own profile → **high**
  2. generic labels with a known supplier → **medium**
  3. generic labels, unknown supplier → **low**
  Several different values for one field → value `null`, confidence **low**, all candidates
  offered on the review screen. Never a guess.
- `index.ts`: `parseDocumentText(text)` → `{ extractor, extractorVersion, fields, warnings }`.
  Fields: supplier, document type, bill date, period start/end, due date, total, VAT and rate,
  standing charge, invoice number, account (masked), MPRN/GPRN (masked), day/night/peak/24-hour/gas
  kWh and their unit rates.

### Adding a supplier parser

1. Add (or check) the supplier in `suppliers.ts` (`names` patterns run on lower-case,
   accent-free text; add the domain printed on bills).
2. Add a profile in `profiles.ts` keyed by the supplier id with the exact label wording from the
   bill (start-of-line anchors `^` keep matches tight). Only list groups the bill really has.
3. Add a **synthetic or redacted** fixture `tests/fixtures/bills/<supplier>-<type>.txt`, written
   as the PDF text layer comes out (one visual line per line). Never commit a real bill.
4. Add an expectation in `parsers.test.ts`. The privacy test checks that no fixture's account or
   meter number survives into the output: add the fixture's numbers to its list.
5. Bump `ENGINE_VERSION` in `index.ts` if generic behaviour changed.

## Data model (migration `20261021300000_documents_tax.sql`)

`documents`, `document_extractions`, `document_links`, `expenses`, `tax_years`, `tax_rules`
(global, read-only to members), `tax_evidence_items`, `wfh_days`. Money is integer cents
(`bigint`). Every household table has RLS on `household_id = current_household_id()`. Child rows
use composite foreign keys `(x_id, household_id)` so a row can never point at another household's
document, member or tax year. `documents.confirmed_fields` lists the user-owned fields; only
`applyProposals` (which skips them) ever writes proposals. The employer allowance (D) is stored as
a `tax_evidence_items` row with category `employer_remote_working_allowance` and no document.

Seeded rule: `IE_REMOTE_WORKING_RELIEF` v1, tax years 2022 onwards, rate 30%,
`((A × B ÷ C) − D) × 30%`, source
<https://www.revenue.ie/en/jobs-and-pensions/eworking/calculate-allowable-remote-working-costs.aspx>,
reviewed 21 Oct 2026.

## WFH calculation (`src/modules/money/tax/domain/wfh.ts`)

Per adult per tax year. A = Σ bill × share (basis points), held exactly as a BigInt rational;
result `(A·B·30 − D·C·30·10000) / (C·100·10000)` rounded **once**, half up, floored at 0. Shown
lines (A, share, base) are rounded for display only. C is 365 or 366. Missing months count as 0
days and are listed. Worked example: A €3,128.60, B 148, C 365, D 0 → **€380.57** (the prototype's
€380.58 came from floating-point display rounding: 312,860 × 148 × 30 ÷ 36,500 = 38,057.49 cents).

## Privacy

- Originals live only in the private `household-documents` bucket under the household's folder;
  storage policies allow insert/select/delete only there. Viewing uses 5-minute signed URLs.
- Extracted text is sent once to the parse action and dropped; it is **not stored** (not needed
  for search yet) and never logged. Job summaries contain counts and the parser name only.
- Account, MPRN and GPRN are stored as `•••• 1234`. Snippets shown for review mask any run of 7+
  digits. Whatever the user types into an identifier field is masked before saving.
- OCR runs on the device (Tesseract.js). Its worker, core and English language data load from the
  package's default CDNs (jsDelivr, tessdata.projectnaptha.com); the image never leaves the
  device except as the stored original.

## Limits

- OCR on phone photos depends on light, focus and flatness; crumpled receipts read poorly.
  Everything goes through review and nothing is auto-confirmed.
- Scanned PDFs: only the first 4 pages are OCR'd. Text-layer PDFs: first 30 pages.
- HEIC photos can only be read where the browser can decode them (Safari); elsewhere they're
  stored and previewed via link, and the user types the details.
- Supplier profiles were drafted from public layouts and synthetic fixtures; they need tuning with
  the household's own redacted bills (PLAN §12, R2.4). Until then expect medium/low confidence.
- A bill that spans two tax years counts in the year chosen at review; adjust "Amount to count"
  to apportion it.
- No "actually claimed" record yet: Caddy shows evidence and estimates only.
