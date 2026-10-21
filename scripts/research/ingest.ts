// Sends a research result file to Caddy. Any research agent can write a JSON file and run:
//   APP_URL=https://caddy-beryl.vercel.app INGEST_TOKEN=... \
//     node --experimental-strip-types scripts/research/ingest.ts result.json
// The file is validated locally first, so mistakes are reported before anything is sent.
// In a Claude Code cloud session the token can come from a network secret instead: leave
// INGEST_TOKEN unset and the sandbox proxy adds the Authorization header for the app's host.
// --check validates the file without sending it.
import { readFile } from "node:fs/promises";
import {
  describeIssues,
  researchResultSchema,
} from "../../src/modules/housing/server/research.ts";

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const file = args.find((a) => !a.startsWith("--"));
const appUrl = process.env.APP_URL?.trim().replace(/\/$/, "");
const token = process.env.INGEST_TOKEN?.trim();
if (!file || (!checkOnly && !appUrl)) {
  console.error(
    "Usage: APP_URL=https://… [INGEST_TOKEN=…] node --experimental-strip-types scripts/research/ingest.ts [--check] <result.json>",
  );
  process.exit(2);
}

let body: unknown;
try {
  body = JSON.parse(await readFile(file, "utf8"));
} catch (error) {
  console.error(`Couldn't read ${file} as JSON: ${(error as Error).message}`);
  process.exit(1);
}

const parsed = researchResultSchema.safeParse(body);
if (!parsed.success) {
  console.error(
    "The result doesn't match research/schema/research-result.json:",
  );
  for (const line of describeIssues(parsed.error)) console.error(`  - ${line}`);
  process.exit(1);
}

if (checkOnly) {
  console.log(`OK: ${parsed.data.items.length} items match the schema.`);
  process.exit(0);
}

const response = await fetch(`${appUrl}/api/ingest/research`, {
  method: "POST",
  headers: {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    "content-type": "application/json",
  },
  body: JSON.stringify(parsed.data),
});
const text = await response.text();
console.log(`HTTP ${response.status} ${text}`);
process.exit(response.ok ? 0 : 1);
