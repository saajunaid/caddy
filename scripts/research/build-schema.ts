// Regenerates research/schema/research-result.json from the Zod contract.
//   node --experimental-strip-types scripts/research/build-schema.ts
// A unit test fails if the committed file drifts from the Zod schema.
import { mkdir, writeFile } from "node:fs/promises";
import { format, resolveConfig } from "prettier";
import { researchJsonSchema } from "../../src/modules/housing/server/research.ts";

const target = new URL(
  "../../research/schema/research-result.json",
  import.meta.url,
);
const config = (await resolveConfig(target.pathname)) ?? {};
const json = await format(JSON.stringify(researchJsonSchema()), {
  ...config,
  parser: "json",
});
await mkdir(new URL(".", target), { recursive: true });
await writeFile(target, json);
console.log(`Wrote ${target.pathname}`);
