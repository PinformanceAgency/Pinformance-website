"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useOrg } from "@/hooks/use-org";
import { canAccessPath } from "@/lib/auth/access";

/**
 * Redirects a `store_owner` away from any dashboard page they're not allowed
 * to view (e.g. a deep-link to /pipeline). Renders nothing. Mounted once in the
 * dashboard layout. Data is already org-scoped by RLS; this is the page-level
 * gate that matches the trimmed sidebar.
 */
export function StoreOwnerGuard() {
  const { user, loading } = useOrg();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    if (!canAccessPath(user.role, pathname)) {
      router.replace("/overview");
    }
  }, [loading, user, pathname, router]);

  return null;
}
