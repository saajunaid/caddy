// Polite HTTP for scheduled jobs: identifying User-Agent, at most ~1 request per second,
// a timeout, and one retry for temporary failures. Injectable so tests never touch the network.

export const USER_AGENT =
  "CaddyBot/0.1 (+https://caddy-beryl.vercel.app; private household use)";

export type HttpResponse = { status: number; text: string };

export type Fetcher = (
  url: string,
  init?: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<HttpResponse>;

export type PoliteFetcherOptions = {
  /** Minimum gap between the start of consecutive requests. */
  minIntervalMs?: number;
  timeoutMs?: number;
  /** Extra attempts for network errors, 429 and 5xx. */
  retries?: number;
  retryDelayMs?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
};

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function politeFetcher(options: PoliteFetcherOptions = {}): Fetcher {
  const {
    minIntervalMs = 1100,
    timeoutMs = 30_000,
    retries = 1,
    retryDelayMs = 5_000,
    userAgent = USER_AGENT,
    fetchImpl = fetch,
    sleep: wait = sleep,
    clock = Date.now,
  } = options;
  let last = -Infinity;

  async function once(
    url: string,
    init: Parameters<Fetcher>[1],
  ): Promise<HttpResponse> {
    const gap = last + minIntervalMs - clock();
    if (gap > 0) await wait(gap);
    last = clock();
    const response = await fetchImpl(url, {
      method: init?.method ?? "GET",
      headers: {
        "user-agent": userAgent,
        accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        ...init?.headers,
      },
      body: init?.body,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: response.status, text: await response.text() };
  }

  return async (url, init) => {
    let attempt = 0;
    for (;;) {
      try {
        const result = await once(url, init);
        const temporary = result.status === 429 || result.status >= 500;
        if (!temporary || attempt >= retries) return result;
      } catch (error) {
        if (attempt >= retries) {
          throw new Error(
            `Request to ${new URL(url).hostname} failed: ${(error as Error).message}`,
          );
        }
      }
      attempt += 1;
      await wait(retryDelayMs);
    }
  };
}
