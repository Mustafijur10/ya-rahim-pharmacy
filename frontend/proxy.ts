import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intl = createIntlMiddleware(routing);

/** Laravel's session cookie (SESSION_COOKIE in backend/.env). */
const SESSION_COOKIE = "yarahim_session";

/**
 * Optimistic gate only: sends people without a session to the right sign-in page.
 * Real permission checks happen in the Laravel API on every request.
 */
const PROTECTED: { prefix: string; login: string }[] = [
  { prefix: "/admin", login: "/staff/login" },
  { prefix: "/rider", login: "/staff/login" },
  { prefix: "/account", login: "/login" },
];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const bare = pathname.replace(/^\/bn(?=\/|$)/, "") || "/";
  const area = PROTECTED.find((p) => bare === p.prefix || bare.startsWith(p.prefix + "/"));

  if (area && !request.cookies.has(SESSION_COOKIE)) {
    const localePrefix = pathname.startsWith("/bn") ? "/bn" : "";
    const url = new URL(`${localePrefix}${area.login}`, request.url);
    url.searchParams.set("next", bare + search);
    return NextResponse.redirect(url);
  }

  return intl(request);
}

export const config = {
  // Everything except the API proxy, Next internals and files with an extension.
  matcher: ["/((?!api|sanctum|_next|_vercel|.*\\..*).*)"],
};
