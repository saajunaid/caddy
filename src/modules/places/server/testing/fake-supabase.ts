// A tiny stand-in for a Supabase client in unit tests: records each query's chain of calls and
// answers with whatever the handler returns. Not for production use.

export type FakeQuery = {
  table: string;
  calls: { method: string; args: unknown[] }[];
};

export type FakeResult = { data?: unknown; error?: { message: string } | null };

export function fakeSupabase(
  handler: (query: FakeQuery) => FakeResult = () => ({ data: [] }),
) {
  const queries: FakeQuery[] = [];
  const client = {
    from(table: string) {
      const query: FakeQuery = { table, calls: [] };
      queries.push(query);
      const builder: object = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "then") {
              const result = handler(query);
              return (resolve: (value: unknown) => void) =>
                resolve({
                  data: result.data ?? null,
                  error: result.error ?? null,
                });
            }
            return (...args: unknown[]) => {
              query.calls.push({ method: String(prop), args });
              return builder;
            };
          },
        },
      );
      return builder;
    },
  };
  return { client, queries };
}

/** The first argument of the first call to `method` in a query. */
export function argOf(query: FakeQuery, method: string): unknown {
  return query.calls.find((c) => c.method === method)?.args[0];
}

export function has(query: FakeQuery, method: string): boolean {
  return query.calls.some((c) => c.method === method);
}
