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

const PITCH_HOSTNAMES = new Set([
  "pitch.pinformance-agency.com",
  // Local development: `pitch.localhost:3000` resolves to 127.0.0.1, so the
  // pitch canvas is reachable locally on the same rewrite path production uses.
  "pitch.localhost",
]);

const ORGANIC_HOSTNAMES = new Set([
  "organic.pinformance-agency.com",
  // Local development: `organic.localhost:3000` resolves to 127.0.0.1 in
  // every modern browser, so the organic app is reachable locally on the
  // same rewrite path production uses.
  "organic.localhost",
]);

/**
 * HTTP Basic Auth gate. Credentials are passed in per surface so the
 * calculator and the pitch canvas can be shared with different people.
 *
 * If either credential is unset the gate is OFF (fail-open), so deploying a
 * new gated surface never locks it before the env vars are configured in
 * Vercel. Returns a 401 when auth is required and missing/wrong, else null.
 */
function basicAuthChallenge(
  request: NextRequest,
  rawUser: string | undefined,
  rawPass: string | undefined,
  realm: string
): NextResponse | null {
  // Trim both sides. Pasting a value into the Vercel dashboard very easily
  // carries a leading/trailing space or newline, which then never matches
  // what the user types and reads as "the password is wrong".
  const user = rawUser?.trim();
  const pass = rawPass?.trim();
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
    headers: { "WWW-Authenticate": `Basic realm="${realm}"` },
  });
}

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const isCalculatorHost = CALCULATOR_HOSTNAMES.has(host);
  const isCalculatorPath = request.nextUrl.pathname.startsWith("/calculator");
  const isTyPageHost = TY_PAGE_HOSTNAMES.has(host);
  const isOnboardingHost = ONBOARDING_HOSTNAMES.has(host);
  const isOrganicHost = ORGANIC_HOSTNAMES.has(host);
  const isPitchHost = PITCH_HOSTNAMES.has(host);
  const isPitchPath = request.nextUrl.pathname.startsWith("/pitch");

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
  // Keep /api/organic/* passing through unchanged so the app's own endpoints
  // (activate, task-status) reach their routes instead of being rewritten
  // into /organic/api/organic/* (which doesn't exist → 404).
  if (isOrganicHost && !request.nextUrl.pathname.startsWith("/organic") && !request.nextUrl.pathname.startsWith("/api/organic")) {
    const url = request.nextUrl.clone();
    url.pathname = "/organic" + (request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname);
    // Carry the browser-visible path through to the server. The organic
    // root layout renders a sidebar scoped to whichever client is open,
    // and a root layout cannot see the params of nested routes — so it
    // reads the path from here instead. Set on the rewrite (not a bare
    // header on the response) so it arrives as a *request* header.
    const headers = new Headers(request.headers);
    headers.set("x-organic-path", request.nextUrl.pathname);
    return NextResponse.rewrite(url, { request: { headers } });
  }

  // Gate the pitch canvas (both the dedicated host and the /pitch path).
  // This has to run before the rewrite below, or the page renders first.
  if (isPitchHost || isPitchPath) {
    const challenge = basicAuthChallenge(
      request,
      process.env.PITCH_AUTH_USER,
      process.env.PITCH_AUTH_PASSWORD,
      "Pinformance Pitch"
    );
    if (challenge) return challenge;
  }

  // Rewrite pitch.pinformance-agency.com root → /pitch.
  if (isPitchHost && !isPitchPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/pitch" + (request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname);
    return NextResponse.rewrite(url);
  }

  // Gate the calculator (both the dedicated host and the /calculator path).
  if (isCalculatorHost || isCalculatorPath) {
    const challenge = basicAuthChallenge(
      request,
      process.env.CALCULATOR_AUTH_USER,
      process.env.CALCULATOR_AUTH_PASSWORD,
      "Pinformance Calculator"
    );
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
