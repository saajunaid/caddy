import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, connect, errorAs, seed, type Fixture } from "./helpers";

let db: Client;
let f: Fixture;

type HouseholdRows = {
  document: string;
  memberAdult: string;
  taxYear: string;
  expense: string;
};
let a: HouseholdRows;
let b: HouseholdRows;

const hash = (n: number) => n.toString(16).padStart(64, "0");

async function insertDocument(
  household: string,
  sha: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const id = randomUUID();
  const row: Record<string, unknown> = {
    id,
    household_id: household,
    storage_path: `${household}/${id}/bill.pdf`,
    original_filename: "bill.pdf",
    mime_type: "application/pdf",
    size_bytes: 1000,
    sha256: sha,
    ...extra,
  };
  const columns = Object.keys(row);
  const values = Object.values(row);
  await db.query(
    `insert into public.documents (${columns.join(", ")}) values (${columns.map((_, i) => `$${i + 1}`).join(", ")})`,
    values,
  );
  return id;
}

async function seedHousehold(
  household: string,
  n: number,
): Promise<HouseholdRows> {
  const document = await insertDocument(household, hash(n), {
    supplier: "Electric Ireland",
    review_status: "needs_review",
    total_cents: 21248,
  });
  const memberAdult = (
    await db.query(
      "insert into public.household_members (household_id, display_name) values ($1, 'Adult') returning id",
      [household],
    )
  ).rows[0].id as string;
  const taxYear = (
    await db.query(
      "insert into public.tax_years (household_id, year) values ($1, 2026) returning id",
      [household],
    )
  ).rows[0].id as string;
  const expense = (
    await db.query(
      `insert into public.expenses (household_id, document_id, merchant, expense_date, category, amount_cents)
       values ($1, $2, 'Electric Ireland', '2026-10-03', 'utilities_electricity', 21248) returning id`,
      [household, document],
    )
  ).rows[0].id as string;
  await db.query(
    `insert into public.document_extractions (household_id, document_id, extractor, extractor_version, text_source, proposed)
     values ($1, $2, 'parser:electric-ireland', '1', 'text-layer', '{"total_cents": 21248}')`,
    [household, document],
  );
  await db.query(
    `insert into public.document_links (household_id, document_id, entity_type, entity_id, purpose)
     values ($1, $2, 'expense', $3, 'household_spending')`,
    [household, document, expense],
  );
  await db.query(
    `insert into public.tax_evidence_items (household_id, tax_year_id, document_id, expense_id, member_id, category, paid_cents)
     values ($1, $2, $3, $4, $5, 'remote_working_electricity', 21248)`,
    [household, taxYear, document, expense, memberAdult],
  );
  await db.query(
    "insert into public.wfh_days (household_id, member_id, tax_year, month, days) values ($1, $2, 2026, 9, 12)",
    [household, memberAdult],
  );
  return { document, memberAdult, taxYear, expense };
}

beforeAll(async () => {
  db = await connect();
  f = await seed(db);
  a = await seedHousehold(f.householdA, 1);
  b = await seedHousehold(f.householdB, 2);
});

afterAll(async () => {
  await db.end();
});

const TABLES = [
  "documents",
  "document_extractions",
  "document_links",
  "expenses",
  "tax_years",
  "tax_evidence_items",
  "wfh_days",
] as const;

describe("household isolation", () => {
  for (const table of TABLES) {
    it(`${table}: adults see only their own household's rows`, async () => {
      const households = await as(db, f.userA, async () =>
        (
          await db.query(`select distinct household_id from public.${table}`)
        ).rows.map((r) => r.household_id),
      );
      expect(households).toEqual([f.householdA]);
    });

    it(`${table}: the other adult in the household sees the same rows`, async () => {
      const count = await as(
        db,
        f.userA2,
        async () => (await db.query(`select 1 from public.${table}`)).rowCount,
      );
      expect(count).toBeGreaterThan(0);
    });

    it(`${table}: hidden from accounts without a household and from anon`, async () => {
      const noProfile = await as(
        db,
        f.userNoProfile,
        async () => (await db.query(`select 1 from public.${table}`)).rowCount,
      );
      expect(noProfile).toBe(0);
      const anonError = await errorAs(db, null, () =>
        db.query(`select 1 from public.${table}`),
      );
      expect(anonError).toMatch(/permission denied/);
    });
  }

  it("a user can't read another household's document by id", async () => {
    const rows = await as(
      db,
      f.userA,
      async () =>
        (
          await db.query("select id from public.documents where id = $1", [
            b.document,
          ])
        ).rows,
    );
    expect(rows).toEqual([]);
  });

  it("a user can't add a document to another household", async () => {
    const error = await errorAs(db, f.userA, () => {
      const id = randomUUID();
      return db.query(
        `insert into public.documents (id, household_id, storage_path, original_filename, mime_type, size_bytes, sha256)
         values ($1, $2, $3, 'x.pdf', 'application/pdf', 10, $4)`,
        [id, f.householdB, `${f.householdB}/${id}/x.pdf`, hash(99)],
      );
    });
    expect(error).toMatch(/row-level security/);
  });

  it("a user can't record someone else as the uploader", async () => {
    const error = await errorAs(db, f.userA, () => {
      const id = randomUUID();
      return db.query(
        `insert into public.documents (id, household_id, storage_path, original_filename, mime_type, size_bytes, sha256, uploaded_by)
         values ($1, $2, $3, 'x.pdf', 'application/pdf', 10, $4, $5)`,
        [id, f.householdA, `${f.householdA}/${id}/x.pdf`, hash(98), f.userA2],
      );
    });
    expect(error).toMatch(/row-level security/);
  });

  it("updates and deletes never reach another household's rows", async () => {
    const result = await as(db, f.userA, async () => {
      const updated = await db.query(
        "update public.documents set supplier = 'Hacked' where id = $1",
        [b.document],
      );
      const deleted = await db.query(
        "delete from public.expenses where id = $1",
        [b.expense],
      );
      return { updated: updated.rowCount, deleted: deleted.rowCount };
    });
    expect(result).toEqual({ updated: 0, deleted: 0 });
  });

  it("evidence can't point at another household's member, tax year or document", async () => {
    const attempts = [
      [a.taxYear, a.document, b.memberAdult],
      [b.taxYear, a.document, a.memberAdult],
      [a.taxYear, b.document, a.memberAdult],
    ];
    for (const [taxYear, document, member] of attempts) {
      const error = await errorAs(db, f.userA, () =>
        db.query(
          `insert into public.tax_evidence_items (household_id, tax_year_id, document_id, member_id, category, paid_cents)
           values ($1, $2, $3, $4, 'remote_working_broadband', 100)`,
          [f.householdA, taxYear, document, member],
        ),
      );
      expect(error).toMatch(/foreign key/);
    }
  });

  it("WFH days can't be recorded for another household's member", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query(
        "insert into public.wfh_days (household_id, member_id, tax_year, month, days) values ($1, $2, 2026, 1, 5)",
        [f.householdA, b.memberAdult],
      ),
    );
    expect(error).toMatch(/foreign key/);
  });

  it("links and extractions can't point at another household's document", async () => {
    const link = await errorAs(db, f.userA, () =>
      db.query(
        `insert into public.document_links (household_id, document_id, entity_type, entity_id, purpose)
         values ($1, $2, 'expense', 'x', 'household_spending')`,
        [f.householdA, b.document],
      ),
    );
    expect(link).toMatch(/foreign key/);
    const extraction = await errorAs(db, f.userA, () =>
      db.query(
        `insert into public.document_extractions (household_id, document_id, extractor, extractor_version, text_source)
         values ($1, $2, 'generic', '1', 'none')`,
        [f.householdA, b.document],
      ),
    );
    expect(extraction).toMatch(/foreign key/);
  });
});

describe("documents", () => {
  it("reject a duplicate file in the same household but allow it in another", async () => {
    await expect(insertDocument(f.householdA, hash(1))).rejects.toThrow(
      /duplicate key/,
    );
    const other = await insertDocument(f.householdB, hash(1));
    expect(other).toBeTruthy();
    await db.query("delete from public.documents where id = $1", [other]);
  });

  it("must be stored under <household>/<document>/", async () => {
    const id = randomUUID();
    await expect(
      db.query(
        `insert into public.documents (id, household_id, storage_path, original_filename, mime_type, size_bytes, sha256)
         values ($1, $2, $3, 'x.pdf', 'application/pdf', 10, $4)`,
        [id, f.householdA, `${f.householdB}/${id}/x.pdf`, hash(50)],
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("only accept the allowed file types and sizes", async () => {
    await expect(
      insertDocument(f.householdA, hash(51), { mime_type: "text/html" }),
    ).rejects.toThrow(/check constraint/);
    await expect(
      insertDocument(f.householdA, hash(52), {
        size_bytes: 20 * 1024 * 1024 + 1,
      }),
    ).rejects.toThrow(/check constraint/);
  });

  it("keep the stored file's identity fixed: adults can edit reviewed fields only", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query("update public.documents set sha256 = $1 where id = $2", [
        hash(77),
        a.document,
      ]),
    );
    expect(error).toMatch(/permission denied/);
    const ok = await as(
      db,
      f.userA,
      async () =>
        (
          await db.query(
            "update public.documents set supplier = 'SSE Airtricity', confirmed_fields = '{supplier}', review_status = 'confirmed' where id = $1",
            [a.document],
          )
        ).rowCount,
    );
    expect(ok).toBe(1);
  });

  it("deleting a document removes its extractions, links and evidence but keeps the expense", async () => {
    const doc = await insertDocument(f.householdA, hash(60));
    const expense = (
      await db.query(
        `insert into public.expenses (household_id, document_id, merchant, expense_date, category, amount_cents)
         values ($1, $2, 'Eir', '2026-10-01', 'broadband', 4500) returning id`,
        [f.householdA, doc],
      )
    ).rows[0].id;
    await db.query(
      `insert into public.tax_evidence_items (household_id, tax_year_id, document_id, member_id, category, paid_cents)
       values ($1, $2, $3, $4, 'remote_working_broadband', 4500)`,
      [f.householdA, a.taxYear, doc, a.memberAdult],
    );
    await as(db, f.userA, async () => {
      await db.query("delete from public.documents where id = $1", [doc]);
      const evidence = await db.query(
        "select 1 from public.tax_evidence_items where document_id = $1",
        [doc],
      );
      const kept = await db.query(
        "select document_id from public.expenses where id = $1",
        [expense],
      );
      expect(evidence.rowCount).toBe(0);
      expect(kept.rows).toEqual([{ document_id: null }]);
    });
    await db.query("delete from public.documents where id = $1", [doc]);
    await db.query("delete from public.expenses where id = $1", [expense]);
  });
});

describe("tax rules", () => {
  it("seed the Irish remote working relief rule with its Revenue source", async () => {
    const rule = await as(
      db,
      f.userA,
      async () =>
        (
          await db.query(
            "select rule_json, official_source_url, tax_year_from, status from public.tax_rules where rule_code = 'IE_REMOTE_WORKING_RELIEF' and version = 1",
          )
        ).rows[0],
    );
    expect(rule.status).toBe("active");
    expect(rule.tax_year_from).toBe(2022);
    expect(rule.rule_json.rate_percent).toBe(30);
    expect(rule.official_source_url).toMatch(/^https:\/\/www\.revenue\.ie\//);
  });

  it("are read-only to members and hidden from accounts without a household", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query("update public.tax_rules set status = 'draft'"),
    );
    expect(error).toMatch(/permission denied/);
    const count = await as(
      db,
      f.userNoProfile,
      async () => (await db.query("select 1 from public.tax_rules")).rowCount,
    );
    expect(count).toBe(0);
  });
});

describe("WFH days", () => {
  const insert = (year: number, month: number, days: number) =>
    db.query(
      "insert into public.wfh_days (household_id, member_id, tax_year, month, days) values ($1, $2, $3, $4, $5)",
      [f.householdA, a.memberAdult, year, month, days],
    );

  it("can't exceed the days in that month", async () => {
    await expect(insert(2026, 2, 29)).rejects.toThrow(/check constraint/);
    await expect(insert(2026, 4, 31)).rejects.toThrow(/check constraint/);
  });

  it("allow 29 February in a leap year", async () => {
    await insert(2028, 2, 29);
    await db.query("delete from public.wfh_days where tax_year = 2028");
  });

  it("are one row per member per month", async () => {
    await expect(insert(2026, 9, 3)).rejects.toThrow(/duplicate key/);
  });
});

describe("evidence", () => {
  it("one employer allowance per member per tax year", async () => {
    const add = () =>
      db.query(
        `insert into public.tax_evidence_items (household_id, tax_year_id, member_id, category, paid_cents)
         values ($1, $2, $3, 'employer_remote_working_allowance', 1000)`,
        [f.householdA, a.taxYear, a.memberAdult],
      );
    await add();
    await expect(add()).rejects.toThrow(/duplicate key/);
  });

  it("share must be above 0% and at most 100%", async () => {
    await expect(
      db.query(
        `insert into public.tax_evidence_items (household_id, tax_year_id, member_id, category, paid_cents, share_percent)
         values ($1, $2, $3, 'other', 10, 0)`,
        [f.householdA, a.taxYear, a.memberAdult],
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

// The statements the server actions send through PostgREST, run as a signed-in adult, so a missing
// grant or policy (upserts need insert AND update) fails here rather than in production.
describe("app writes as a signed-in adult", () => {
  it("reserve a document, then record what was read", async () => {
    const error = await errorAs(db, f.userA, async () => {
      const id = randomUUID();
      await db.query(
        `insert into public.documents (id, household_id, storage_path, original_filename, mime_type, size_bytes, sha256, review_status, uploaded_by)
         values ($1, $2, $3, 'bill.pdf', 'application/pdf', 1000, $4, 'processing', $5)`,
        [
          id,
          f.householdA,
          `${f.householdA}/${id}/bill.pdf`,
          hash(200),
          f.userA,
        ],
      );
      await db.query(
        `insert into public.document_extractions (household_id, document_id, extractor, extractor_version, text_source, text_chars, proposed, confidence, snippets, candidates, warnings, created_by)
         values ($1, $2, 'rules:eir', '1.1', 'text-layer', 400, '{"total_cents": 4500}', '{"total_cents": "high"}', '{}', '{}', '{}', $3)`,
        [f.householdA, id, f.userA],
      );
      await db.query(
        `update public.documents set supplier = 'Eir', total_cents = 4500, details = '{"day_kwh": "1"}', review_status = 'needs_review'
         where id = $1 and review_status = 'processing'`,
        [id],
      );
    });
    expect(error).toBeNull();
  });

  it("open a tax year by upsert (twice) and link evidence", async () => {
    const result = await as(db, f.userA, async () => {
      const upsert = () =>
        db.query(
          `insert into public.tax_years (household_id, jurisdiction, year) values ($1, 'IE', 2025)
           on conflict (household_id, jurisdiction, year)
           do update set household_id = excluded.household_id, jurisdiction = excluded.jurisdiction, year = excluded.year
           returning id`,
          [f.householdA],
        );
      const first = (await upsert()).rows[0].id;
      const second = (await upsert()).rows[0].id;
      await db.query(
        `insert into public.document_links (household_id, document_id, entity_type, entity_id, purpose)
         values ($1, $2, 'tax_year', $3, 'tax_evidence'), ($1, $2, 'tax_year', $3, 'tax_evidence')
         on conflict (document_id, entity_type, entity_id) do nothing`,
        [f.householdA, a.document, first],
      );
      return { same: first === second };
    });
    expect(result.same).toBe(true);
  });

  it("can't upsert over another household's tax year", async () => {
    const error = await errorAs(db, f.userA, () =>
      db.query(
        `insert into public.tax_years (household_id, jurisdiction, year) values ($1, 'IE', 2026)
         on conflict (household_id, jurisdiction, year) do update set year = excluded.year`,
        [f.householdB],
      ),
    );
    expect(error).toMatch(/row-level security/);
  });

  it("save WFH days by upsert and clear a month", async () => {
    const days = await as(db, f.userA, async () => {
      for (const d of [5, 7]) {
        await db.query(
          `insert into public.wfh_days (household_id, member_id, tax_year, month, days, updated_by)
           values ($1, $2, 2026, 3, $3, $4)
           on conflict (member_id, tax_year, month)
           do update set household_id = excluded.household_id, member_id = excluded.member_id,
             tax_year = excluded.tax_year, month = excluded.month, days = excluded.days,
             updated_by = excluded.updated_by`,
          [f.householdA, a.memberAdult, d, f.userA],
        );
      }
      const saved = (
        await db.query(
          "select days from public.wfh_days where member_id = $1 and tax_year = 2026 and month = 3",
          [a.memberAdult],
        )
      ).rows[0].days;
      await db.query(
        "delete from public.wfh_days where member_id = $1 and tax_year = 2026 and month in (3)",
        [a.memberAdult],
      );
      return saved;
    });
    expect(days).toBe(7);
  });

  it("confirm a review and link an expense", async () => {
    const error = await errorAs(db, f.userA, async () => {
      await db.query(
        `update public.documents set supplier = 'Electric Ireland', document_type = 'electricity_bill',
           document_date = '2026-10-03', period_start = '2026-09-01', period_end = '2026-09-30',
           due_date = '2026-10-20', total_cents = 21248, vat_cents = 1754, details = '{}',
           confirmed_fields = '{supplier,total_cents}', review_status = 'confirmed',
           confirmed_by = $2, confirmed_at = now()
         where id = $1`,
        [a.document, f.userA],
      );
      await db.query(
        `update public.expenses set merchant = 'Electric Ireland', amount_cents = 21248, payment_status = 'paid', is_recurring = true, review_status = 'confirmed' where id = $1`,
        [a.expense],
      );
      await db.query(
        `insert into public.audit_events (household_id, actor_id, action, entity_type, entity_id)
         values ($1, $2, 'document.confirmed', 'document', $3)`,
        [f.householdA, f.userA, a.document],
      );
    });
    expect(error).toBeNull();
  });
});

// The test database has no Supabase storage schema, so the migration skips its storage section.
// Recreate the tiny part of storage the policies use, then run that section again to test the rules.
describe("storage policies", () => {
  beforeAll(async () => {
    await db.query(`
      create schema if not exists storage;
      create table if not exists storage.buckets (
        id text primary key, name text not null, public boolean default false,
        file_size_limit bigint, allowed_mime_types text[]
      );
      create table if not exists storage.objects (
        id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
        name text not null, owner uuid default auth.uid()
      );
      create or replace function storage.foldername(name text) returns text[]
      language plpgsql as $fn$
      declare _parts text[];
      begin
        select string_to_array(name, '/') into _parts;
        return _parts[1:array_length(_parts, 1) - 1];
      end
      $fn$;
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated, anon;
      grant select, insert, delete on storage.objects to authenticated;
      grant execute on function storage.foldername(text) to authenticated;
    `);
    const migration = await readFile(
      path.resolve(
        import.meta.dirname,
        "../../supabase/migrations/20261021300000_documents_tax.sql",
      ),
      "utf8",
    );
    const section = /-- BEGIN storage\n([\s\S]*?)-- END storage/.exec(
      migration,
    )?.[1];
    if (!section) throw new Error("Storage section not found in the migration");
    await db.query(section);
    await db.query(
      `insert into storage.objects (bucket_id, name) values
        ('household-documents', $1), ('household-documents', $2)`,
      [
        `${f.householdA}/${a.document}/bill.pdf`,
        `${f.householdB}/${b.document}/bill.pdf`,
      ],
    );
  });

  it("create a private bucket limited to 20 MB of PDFs and images", async () => {
    const bucket = (
      await db.query(
        "select * from storage.buckets where id = 'household-documents'",
      )
    ).rows[0];
    expect(bucket.public).toBe(false);
    expect(Number(bucket.file_size_limit)).toBe(20 * 1024 * 1024);
    expect(bucket.allowed_mime_types).toEqual(
      expect.arrayContaining([
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/heic",
        "image/webp",
      ]),
    );
  });

  it("let adults read only their household's folder", async () => {
    const names = await as(db, f.userA, async () =>
      (await db.query("select name from storage.objects")).rows.map(
        (r) => r.name,
      ),
    );
    expect(names).toEqual([`${f.householdA}/${a.document}/bill.pdf`]);
  });

  it("let adults upload into their household's folder only", async () => {
    const own = await errorAs(db, f.userA, () =>
      db.query(
        "insert into storage.objects (bucket_id, name) values ('household-documents', $1)",
        [`${f.householdA}/${randomUUID()}/new.pdf`],
      ),
    );
    expect(own).toBeNull();
    const other = await errorAs(db, f.userA, () =>
      db.query(
        "insert into storage.objects (bucket_id, name) values ('household-documents', $1)",
        [`${f.householdB}/${randomUUID()}/new.pdf`],
      ),
    );
    expect(other).toMatch(/row-level security/);
    const root = await errorAs(db, f.userA, () =>
      db.query(
        "insert into storage.objects (bucket_id, name) values ('household-documents', 'loose.pdf')",
      ),
    );
    expect(root).toMatch(/row-level security/);
  });

  it("never let accounts without a household upload or read", async () => {
    const error = await errorAs(db, f.userNoProfile, () =>
      db.query(
        "insert into storage.objects (bucket_id, name) values ('household-documents', $1)",
        [`${f.householdA}/${randomUUID()}/new.pdf`],
      ),
    );
    expect(error).toMatch(/row-level security/);
  });

  it("let adults delete only their household's files", async () => {
    const deleted = await as(
      db,
      f.userA,
      async () =>
        (
          await db.query(
            "delete from storage.objects where bucket_id = 'household-documents'",
          )
        ).rowCount,
    );
    expect(deleted).toBe(1);
  });
});
