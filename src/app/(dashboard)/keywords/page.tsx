"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { cn } from "@/lib/utils";
import {
  Hash,
  Plus,
  X,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type { Keyword } from "@/lib/types";

type SortKey =
  | "keyword"
  | "search_volume"
  | "competition_score"
  | "relevance_score"
  | "performance_score"
  | "source"
  | "category";

export default function KeywordsPage() {
  const { org, loading } = useOrg();
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("performance_score");
  const [sortAsc, setSortAsc] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!org) return;
    loadKeywords();
  }, [org]);

  async function loadKeywords() {
    if (!org) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("keywords")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false });

    setKeywords((data as Keyword[]) || []);
  }

  async function handleAdd() {
    if (!org || !newKeyword.trim()) return;
    setAdding(true);

    const supabase = createClient();
    await supabase.from("keywords").insert({
      org_id: org.id,
      keyword: newKeyword.trim(),
      category: newCategory.trim() || null,
      source: "manual",
    });

    setNewKeyword("");
    setNewCategory("");
    setShowAdd(false);
    setAdding(false);
    loadKeywords();
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const sorted = [...keywords].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === "string") {
      return sortAsc
        ? aVal.localeCompare(bVal as string)
        : (bVal as string).localeCompare(aVal);
    }
    return sortAsc
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  function scoreColor(score: number | null) {
    if (score == null) return "";
    if (score >= 0.7) return "bg-green-100 text-green-700";
    if (score >= 0.4) return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) return null;
    return sortAsc ? (
      <ArrowUp className="w-3 h-3 inline ml-0.5" />
    ) : (
      <ArrowDown className="w-3 h-3 inline ml-0.5" />
    );
  }

  if (loading) {
    return <div className="h-96 bg-muted animate-pulse rounded-xl" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Keywords</h1>
          <p className="text-muted-foreground mt-1">
            {keywords.length} keywords tracked
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" /> Add Keyword
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/50">
                <th
                  className="px-4 py-3 font-medium cursor-pointer hover:text-foreground"
                  onClick={() => handleSort("keyword")}
                >
                  Keyword <SortIcon column="keyword" />
                </th>
                <th
                  className="px-4 py-3 font-medium text-right cursor-pointer hover:text-foreground"
                  onClick={() => handleSort("search_volume")}
                >
                  Search Vol <SortIcon column="search_volume" />
                </th>
                <th
                  className="px-4 py-3 font-medium text-right cursor-pointer hover:text-foreground"
                  onClick={() => handleSort("competition_score")}
                >
                  Competition <SortIcon column="competition_score" />
                </th>
                <th
                  className="px-4 py-3 font-medium text-right cursor-pointer hover:text-foreground"
                  onClick={() => handleSort("relevance_score")}
                >
                  Relevance <SortIcon column="relevance_score" />
                </th>
                <th
                  className="px-4 py-3 font-medium text-right cursor-pointer hover:text-foreground"
                  onClick={() => handleSort("performance_score")}
                >
                  Performance <SortIcon column="performance_score" />
                </th>
                <th
                  className="px-4 py-3 font-medium cursor-pointer hover:text-foreground"
                  onClick={() => handleSort("source")}
                >
                  Source <SortIcon column="source" />
                </th>
                <th
                  className="px-4 py-3 font-medium cursor-pointer hover:text-foreground"
                  onClick={() => handleSort("category")}
                >
                  Category <SortIcon column="category" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((kw) => (
                <tr
                  key={kw.id}
                  className="border-b border-border/50 last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-medium">{kw.keyword}</td>
                  <td className="px-4 py-3 text-right">
                    {kw.search_volume?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {kw.competition_score != null ? (
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium",
                          scoreColor(kw.competition_score)
                        )}
                      >
                        {(kw.competition_score * 100).toFixed(0)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {kw.relevance_score != null ? (
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium",
                          scoreColor(kw.relevance_score)
                        )}
                      >
                        {(kw.relevance_score * 100).toFixed(0)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {kw.performance_score != null ? (
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium",
                          scoreColor(kw.performance_score)
                        )}
                      >
                        {(kw.performance_score * 100).toFixed(0)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-muted px-2 py-0.5 rounded">
                      {kw.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {kw.category || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {keywords.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No keywords yet. Keywords are generated during pin creation or you can
          add them manually.
        </div>
      )}

      {/* Add Keyword Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl border border-border max-w-md w-full mx-4">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Add Keyword</h3>
                <button
                  onClick={() => setShowAdd(false)}
                  className="p-1 hover:bg-muted rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Keyword
                </label>
                <input
                  type="text"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder="e.g. summer outfit ideas"
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Category (optional)
                </label>
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="e.g. fashion, home decor"
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowAdd(false)}
                  className="flex-1 bg-muted text-foreground py-2 rounded-lg text-sm font-medium hover:bg-muted/80"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={adding || !newKeyword.trim()}
                  className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {adding ? "Adding..." : "Add Keyword"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
