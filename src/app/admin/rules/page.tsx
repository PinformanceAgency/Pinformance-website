"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import type { FeedbackRule, Organization } from "@/lib/types";

const RULE_TYPES: FeedbackRule["rule_type"][] = [
  "prompt_modifier",
  "content_filter",
  "style_guide",
  "keyword_boost",
  "keyword_block",
];

export default function RulesPage() {
  const { user, isAgencyAdmin, loading: authLoading } = useOrg();
  const router = useRouter();
  const [rules, setRules] = useState<FeedbackRule[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [ruleText, setRuleText] = useState("");
  const [ruleType, setRuleType] = useState<FeedbackRule["rule_type"]>("prompt_modifier");
  const [ruleOrgId, setRuleOrgId] = useState<string>("");
  const [rulePriority, setRulePriority] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAgencyAdmin) {
      router.push("/overview");
      return;
    }

    loadData();
  }, [authLoading, isAgencyAdmin, router]);

  async function loadData() {
    const supabase = createClient();
    const [rulesRes, orgsRes] = await Promise.all([
      supabase
        .from("feedback_rules")
        .select("*")
        .order("priority", { ascending: false }),
      supabase.from("organizations").select("id, name").order("name"),
    ]);

    setRules((rulesRes.data as FeedbackRule[]) || []);
    setOrgs((orgsRes.data as Organization[]) || []);
    setLoading(false);
  }

  async function handleCreate() {
    if (!ruleText.trim() || !user) return;
    setSaving(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("feedback_rules")
      .insert({
        org_id: ruleOrgId || null,
        rule_type: ruleType,
        rule_text: ruleText,
        priority: rulePriority,
        is_active: true,
        created_by: user.id,
      })
      .select()
      .single();

    if (!error && data) {
      setRules((prev) => [data as FeedbackRule, ...prev]);
      setShowCreate(false);
      setRuleText("");
      setRuleType("prompt_modifier");
      setRuleOrgId("");
      setRulePriority(0);
    }

    setSaving(false);
  }

  async function toggleActive(rule: FeedbackRule) {
    const supabase = createClient();
    const { error } = await supabase
      .from("feedback_rules")
      .update({ is_active: !rule.is_active, updated_at: new Date().toISOString() })
      .eq("id", rule.id);

    if (!error) {
      setRules((prev) =>
        prev.map((r) =>
          r.id === rule.id ? { ...r, is_active: !r.is_active } : r
        )
      );
    }
  }

  if (authLoading || loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  const orgName = (orgId: string | null) => {
    if (!orgId) return "Global";
    return orgs.find((o) => o.id === orgId)?.name || orgId;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Feedback Rules</h1>
          <p className="text-muted-foreground mt-1">
            Manage AI content generation rules
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          Add Rule
        </button>
      </div>

      {showCreate && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Create Rule</h2>
            <button onClick={() => setShowCreate(false)}>
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium mb-1 block">Rule Text</label>
              <textarea
                value={ruleText}
                onChange={(e) => setRuleText(e.target.value)}
                className="w-full border border-border rounded-lg p-3 bg-background text-sm resize-none"
                rows={3}
                placeholder="e.g., Always include brand colors in product pins"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Type</label>
              <select
                value={ruleType}
                onChange={(e) =>
                  setRuleType(e.target.value as FeedbackRule["rule_type"])
                }
                className="w-full border border-border rounded-lg p-2.5 bg-background text-sm"
              >
                {RULE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">
                Organization
              </label>
              <select
                value={ruleOrgId}
                onChange={(e) => setRuleOrgId(e.target.value)}
                className="w-full border border-border rounded-lg p-2.5 bg-background text-sm"
              >
                <option value="">Global (all orgs)</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Priority</label>
              <input
                type="number"
                value={rulePriority}
                onChange={(e) => setRulePriority(parseInt(e.target.value) || 0)}
                className="w-full border border-border rounded-lg p-2.5 bg-background text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleCreate}
              disabled={saving || !ruleText.trim()}
              className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Create Rule"}
            </button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left p-4 font-medium">Rule</th>
              <th className="text-left p-4 font-medium">Type</th>
              <th className="text-left p-4 font-medium">Scope</th>
              <th className="text-right p-4 font-medium">Priority</th>
              <th className="text-center p-4 font-medium">Active</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr
                key={rule.id}
                className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
              >
                <td className="p-4 max-w-md">
                  <div className="truncate">{rule.rule_text}</div>
                </td>
                <td className="p-4">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted font-medium">
                    {rule.rule_type.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="p-4 text-muted-foreground">
                  {orgName(rule.org_id)}
                </td>
                <td className="p-4 text-right tabular-nums">{rule.priority}</td>
                <td className="p-4 text-center">
                  <button
                    onClick={() => toggleActive(rule)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      rule.is_active ? "bg-green-500" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                        rule.is_active ? "translate-x-4.5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {rules.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No feedback rules yet. Create one to guide AI content generation.
          </div>
        )}
      </div>
    </div>
  );
}
