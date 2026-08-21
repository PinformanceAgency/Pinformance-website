import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const CALCULATOR_HOSTNAMES = new Set([
  "calculator.pinformance-agency.com",
]);

const TY_PAGE_HOSTNAMES = new Set([
  "typage.pinformance-agency.com",
]);

const ONBOARDING_HOSTNAMES = new Set([
  "onboarding.pinformance-agency.com",
]);

const ORGANIC_HOSTNAMES = new Set([
  "organic.pinformance-agency.com",
]);

/**
 * HTTP Basic Auth gate for the calculator. Credentials come from env vars
 * CALCULATOR_AUTH_USER / CALCULATOR_AUTH_PASSWORD. If either is unset the gate
 * is OFF (fail-open) so deploying this never accidentally locks the live
 * calculator before the credentials are configured in Vercel.
 * Returns a 401 response when auth is required and missing/wrong, else null.
 */
function calculatorAuthChallenge(request: NextRequest): NextResponse | null {
  const user = process.env.CALCULATOR_AUTH_USER;
  const pass = process.env.CALCULATOR_AUTH_PASSWORD;
  if (!user || !pass) return null; // not configured → no gate

  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6)); // Edge-safe base64 decode
      const sep = decoded.indexOf(":");
      const u = decoded.slice(0, sep);
      const p = decoded.slice(sep + 1);
      if (u === user && p === pass) return null; // authorised
    } catch {
      // fall through to challenge
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Pinformance Calculator"' },
  });
}

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const isCalculatorHost = CALCULATOR_HOSTNAMES.has(host);
  const isCalculatorPath = request.nextUrl.pathname.startsWith("/calculator");
  const isTyPageHost = TY_PAGE_HOSTNAMES.has(host);
  const isOnboardingHost = ONBOARDING_HOSTNAMES.has(host);
  const isOrganicHost = ORGANIC_HOSTNAMES.has(host);

  // Rewrite typage.pinformance-agency.com root → /ty-page (public, no auth).
  if (isTyPageHost && !request.nextUrl.pathname.startsWith("/ty-page")) {
    const url = request.nextUrl.clone();
    url.pathname = "/ty-page" + (request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname);
    return NextResponse.rewrite(url);
  }

  // Rewrite onboarding.pinformance-agency.com root → /onboarding (public, no auth).
  // Keep /api/onboarding/* passing through unchanged so the intake POST reaches its route.
  if (isOnboardingHost && !request.nextUrl.pathname.startsWith("/onboarding") && !request.nextUrl.pathname.startsWith("/api/onboarding")) {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding" + (request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname);
    return NextResponse.rewrite(url);
  }

  // Rewrite organic.pinformance-agency.com root → /organic (public, no auth).
  if (isOrganicHost && !request.nextUrl.pathname.startsWith("/organic")) {
    const url = request.nextUrl.clone();
    url.pathname = "/organic" + (request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname);
    return NextResponse.rewrite(url);
  }

  // Gate the calculator (both the dedicated host and the /calculator path).
  if (isCalculatorHost || isCalculatorPath) {
    const challenge = calculatorAuthChallenge(request);
    if (challenge) return challenge;
  }

  if (isCalculatorHost) {
    const url = request.nextUrl.clone();
    if (!url.pathname.startsWith("/calculator")) {
      url.pathname = "/calculator";
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
