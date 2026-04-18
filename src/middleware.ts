import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const CALCULATOR_HOSTNAMES = new Set([
  "calculator.pinformance-agency.com",
]);

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();

  if (CALCULATOR_HOSTNAMES.has(host)) {
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
