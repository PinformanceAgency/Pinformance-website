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
          // If user doesn't exist in users table, try to get org from auth metadata
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

        // Step 3: Get organization - use service-level RPC to bypass RLS issues
        const { data: orgData, error: orgError } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", profile.org_id)
          .single();

        if (orgError) {
          console.error("Org error:", orgError.message, orgError.code);
          // Still set org to null but don't block — user data is enough for onboarding
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
