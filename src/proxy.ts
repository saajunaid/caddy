import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasPublicEnv, publicEnv } from "@/lib/env";

/** Pages anyone can open without signing in. */
const PUBLIC_PATHS = new Set(["/login", "/offline"]);

/**
 * Runs before every page request (see matcher): refreshes the Supabase session cookie
 * and sends signed-out visitors to /login. Pages and Server Actions still check the user
 * themselves; this is the first gate, not the only one.
 */
export async function proxy(request: NextRequest) {
  if (!hasPublicEnv()) {
    return new NextResponse(
      "Caddy isn't configured yet: Supabase settings are missing.",
      {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      },
    );
  }

  const env = publicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet)
            request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers ?? {})) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Validates the session token and refreshes it if needed. Must run before any redirect.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname } = request.nextUrl;

  if (!signedIn && !PUBLIC_PATHS.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return redirectWithCookies(url, response);
  }

  if (signedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return redirectWithCookies(url, response);
  }

  return response;
}

/** Keeps any refreshed session cookies when redirecting. */
function redirectWithCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  matcher: [
    // Everything except API routes (they check auth themselves), build assets, icons,
    // the service worker, manifest and favicon.
    "/((?!api/|_next/static|_next/image|icons/|sw\\.js|manifest\\.webmanifest|favicon\\.ico).*)",
  ],
};
