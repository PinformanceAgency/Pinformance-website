"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Organization, User } from "@/lib/types";

export function useOrg() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      try {
        // Step 1: Get auth user
        const {
          data: { user: authUser },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !authUser) {
          setError("Not authenticated");
          setLoading(false);
          return;
        }

        // Step 2: Get user profile
        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("*")
          .eq("id", authUser.id)
          .single();

        if (profileError) {
          console.error("Profile error:", profileError.message, profileError.code);
          setError(`Profile not found: ${profileError.message}`);
          setLoading(false);
          return;
        }

        if (!profile) {
          setError("No profile data returned");
          setLoading(false);
          return;
        }

        setUser(profile as User);

        // Step 3: Determine the effective org.
        // SECURITY: active_org_id is ONLY honoured for agency_admin. Everyone else
        // is strictly scoped to their own profile.org_id.
        const isAgencyAdmin = (profile as User).role === "agency_admin";
        const effectiveOrgId = isAgencyAdmin
          ? (profile as User & { active_org_id?: string | null }).active_org_id || profile.org_id
          : profile.org_id;

        const { data: orgData, error: orgError } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", effectiveOrgId)
          .single();

        if (orgError) {
          console.error("Org error:", orgError.message, orgError.code);
          setOrg(null);
        } else {
          setOrg(orgData as Organization);
        }
      } catch (err) {
        console.error("useOrg load error:", err);
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return { org, user, loading, error, isAgencyAdmin: user?.role === "agency_admin" };
}
