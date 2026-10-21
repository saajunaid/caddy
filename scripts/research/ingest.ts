// Sends a research result file to Caddy. Any research agent can write a JSON file and run:
//   APP_URL=https://caddy-beryl.vercel.app INGEST_TOKEN=... \
//     node --experimental-strip-types scripts/research/ingest.ts result.json
// The file is validated locally first, so mistakes are reported before anything is sent.
import { readFile } from "node:fs/promises";
import {
  describeIssues,
  researchResultSchema,
} from "../../src/modules/housing/server/research.ts";

const file = process.argv[2];
const appUrl = process.env.APP_URL?.trim().replace(/\/$/, "");
const token = process.env.INGEST_TOKEN?.trim();
if (!file || !appUrl || !token) {
  console.error(
    "Usage: APP_URL=https://… INGEST_TOKEN=… node --experimental-strip-types scripts/research/ingest.ts <result.json>",
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

const response = await fetch(`${appUrl}/api/ingest/research`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(parsed.data),
});
const text = await response.text();
console.log(`HTTP ${response.status} ${text}`);
process.exit(response.ok ? 0 : 1);
