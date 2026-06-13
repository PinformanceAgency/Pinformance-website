import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const CALCULATOR_HOSTNAMES = new Set([
  "calculator.pinformance-agency.com",
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

  // Gate the calculator (both the dedicated host and the /calculator path).
  if (isCalculatorHost || isCalculatorPath) {
    // TEMP debug: expose whether the middleware actually sees the auth env vars.
    const dbg =
      (process.env.CALCULATOR_AUTH_USER ? "U" : "-") +
      (process.env.CALCULATOR_AUTH_PASSWORD ? "P" : "-");

    const challenge = calculatorAuthChallenge(request);
    if (challenge) {
      challenge.headers.set("x-calc-auth", dbg);
      return challenge;
    }

    let res: NextResponse;
    if (isCalculatorHost && !request.nextUrl.pathname.startsWith("/calculator")) {
      const url = request.nextUrl.clone();
      url.pathname = "/calculator";
      res = NextResponse.rewrite(url);
    } else {
      res = NextResponse.next();
    }
    res.headers.set("x-calc-auth", dbg);
    return res;
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
