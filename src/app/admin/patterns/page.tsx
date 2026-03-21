"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

interface PerformancePattern {
  id: string;
  pattern_type: string;
  pattern_data: Record<string, unknown>;
  is_active: boolean;
  discovered_at: string;
}

export default function PatternsPage() {
  const { isAgencyAdmin, loading: authLoading } = useOrg();
  const router = useRouter();
  const [patterns, setPatterns] = useState<PerformancePattern[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAgencyAdmin) {
      router.push("/overview");
      return;
    }

    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("performance_patterns")
        .select("*")
        .order("discovered_at", { ascending: false });

      setPatterns((data as PerformancePattern[]) || []);
      setLoading(false);
    }

    load();
  }, [authLoading, isAgencyAdmin, router]);

  if (authLoading || loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  const typeColors: Record<string, string> = {
    keyword: "bg-blue-100 text-blue-700",
    visual_style: "bg-purple-100 text-purple-700",
    posting_time: "bg-green-100 text-green-700",
    content_type: "bg-yellow-100 text-yellow-700",
    description_pattern: "bg-pink-100 text-pink-700",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Performance Patterns</h1>
        <p className="text-muted-foreground mt-1">
          Cross-brand patterns discovered by AI analysis
        </p>
      </div>

      {patterns.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-card border border-border rounded-xl">
          <Sparkles className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" />
          No patterns discovered yet. Patterns will appear as the AI analyzes
          pin performance across clients.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {patterns.map((pattern) => (
            <div
              key={pattern.id}
              className="bg-card border border-border rounded-xl p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    typeColors[pattern.pattern_type] || "bg-muted"
                  }`}
                >
                  {pattern.pattern_type.replace(/_/g, " ")}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    pattern.is_active
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {pattern.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto">
                {JSON.stringify(pattern.pattern_data, null, 2)}
              </pre>
              <div className="text-xs text-muted-foreground">
                Discovered:{" "}
                {new Date(pattern.discovered_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
