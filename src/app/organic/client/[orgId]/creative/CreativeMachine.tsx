"use client";

/**
 * Johanne's Pinterest Creative Machine (module 3), per store. Her screens and
 * her order — brief, visual identity, then per campaign: inspirations,
 * config, scenarios, workstation — with the state in the database instead of
 * one browser's localStorage. A test; see src/lib/organic/creative-machine.ts.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface Brief {
  brandName?: string; about?: string; target?: string; positioning?: string;
  distinction?: string; antiPatterns?: string; heroProduct?: string;
}
interface Config { total: number; fullHuman: number; partialHuman: number; productOnly: number; directives: string }
interface Campaign {
  id: string; name: string; inspiration_images: string[]; insights: Record<string, unknown> | null;
  config: Config; product_images: string[]; scenarios: string[]; used_scenarios: string[]; created_at: string;
}
interface State {
  brief: Brief; brief_prefilled: boolean; brand_images: string[];
  style_lock: Record<string, unknown> | null; conflicts: string[]; campaigns: Campaign[];
}

async function call(orgId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/organic/creative/${orgId}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: Record<string, unknown> & { error?: string } = {};
  try { data = JSON.parse(text); } catch { /* keep raw */ }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status} — ${text.slice(0, 160)}`);
  return data;
}

/** Her resize: longest side 1024px, JPEG at 0.8. */
function resizeImage(file: File, maxSize = 1024, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
      };
      img.onerror = () => reject(new Error(`Could not read ${file.name}`));
      img.src = String(e.target?.result);
    };
    reader.readAsDataURL(file);
  });
}

function downloadTxt(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const btn = "px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-40";
const primary = `${btn} bg-neutral-900 text-white hover:bg-neutral-800`;
const ghost = `${btn} border border-neutral-300 text-neutral-700 hover:bg-neutral-50`;
const field = "w-full rounded border border-neutral-300 px-2 py-1.5 text-xs";

function Stepper({ steps, current, onPick }: { steps: string[]; current: number; onPick?: (i: number) => void }) {
  return (
    <div className="flex gap-1">
      {steps.map((s, i) => (
        <button key={s} type="button" onClick={() => onPick?.(i)} className="flex-1 text-center">
          <div className={`h-1 rounded ${i <= current ? "bg-neutral-900" : "bg-neutral-200"}`} />
          <span className={`text-[10px] ${i === current ? "font-bold text-neutral-900" : "text-neutral-500"}`}>{s}</span>
        </button>
      ))}
    </div>
  );
}

function Uploader({ images, max, label, busy, onAdd, onRemove }: {
  images: string[]; max: number; label: string; busy: boolean;
  onAdd: (files: File[]) => void; onRemove: (url: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Send only what fits. Dropping five files on a box that takes three used to
  // save the first three, fail on the fourth, and leave the screen at 0/3.
  const add = (files: File[]) => {
    const room = max - images.length;
    const pics = files.filter((f) => f.type.startsWith("image/"));
    if (room > 0 && pics.length > 0) onAdd(pics.slice(0, room));
  };
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-medium text-neutral-600">{label}</div>
      <div
        onClick={() => !busy && images.length < max && ref.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (!busy) add(Array.from(e.dataTransfer.files)); }}
        className="rounded-lg border-2 border-dashed border-neutral-300 p-4 text-center text-[11px] text-neutral-500 cursor-pointer hover:border-neutral-400">
        {busy ? "Uploading…" : images.length >= max ? `Maximum of ${max} reached` : `Drag & drop or click to add (${images.length}/${max})`}
        <input ref={ref} type="file" accept="image/*" multiple hidden
          onChange={(e) => { add(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      </div>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((u) => (
            <div key={u} className="relative h-16 w-16 overflow-hidden rounded">
              <img src={u} alt="" className="h-full w-full object-cover" />
              <button type="button" onClick={() => onRemove(u)} disabled={busy}
                className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-black/70 text-[10px] leading-4 text-white">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Chips({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-2">
      {Object.entries(data).map(([k, v]) => (
        <div key={k}>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{k.replace(/_/g, " ")}</div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {(Array.isArray(v) ? v : [v]).map((item, i) => (
              <span key={i} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-800">
                {typeof item === "string" ? item : JSON.stringify(item)}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StyleLockCard({ lock }: { lock: Record<string, unknown> }) {
  const vi = (lock.visual_identity ?? {}) as Record<string, string>;
  const list = (k: string) => (Array.isArray(lock[k]) ? (lock[k] as string[]) : []);
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-3 space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">BRAND_STYLE_LOCK</div>
      <p className="text-sm italic text-neutral-800">{String(lock.brand_essence ?? "")}</p>
      <div className="divide-y divide-neutral-100">
        {Object.entries(vi).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-1 text-[11px]">
            <span className="capitalize text-neutral-500">{k.replace(/_/g, " ")}</span>
            <span className="max-w-[65%] text-right text-neutral-800">{v}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 text-[11px]">
        <div><div className="font-semibold text-emerald-700">Non-negotiables</div>{list("non_negotiables").map((n, i) => <div key={i}>• {n}</div>)}</div>
        <div><div className="font-semibold text-red-700">Forbidden</div>{list("forbidden_elements").map((n, i) => <div key={i}>• {n}</div>)}</div>
      </div>
      {list("visual_signatures").length > 0 && (
        <div className="text-[11px]"><span className="font-semibold text-neutral-600">Signatures: </span>{list("visual_signatures").join(" · ")}</div>
      )}
    </div>
  );
}

const BRIEF_FIELDS: Array<{ key: keyof Brief; label: string; placeholder: string; textarea?: boolean }> = [
  { key: "brandName", label: "Brand name", placeholder: "e.g. Caudalie, Typology, Glossier" },
  { key: "about", label: "Brand universe", placeholder: "Describe the brand's universe, positioning, and what it embodies", textarea: true },
  { key: "target", label: "Target audience", placeholder: "e.g. women 30-55, skincare-conscious, drawn to natural ingredients" },
  { key: "positioning", label: "Market positioning", placeholder: "e.g. affordable luxury, premium, mass market, niche…" },
  { key: "distinction", label: "Distinctive details to pay attention to", placeholder: "What makes the brand visually recognizable — textures, colors, moods, signature details", textarea: true },
  { key: "antiPatterns", label: "What the brand would NEVER do", placeholder: "e.g. never pure white backgrounds, never slow-living ethereal moods, never catalog-style models", textarea: true },
  { key: "heroProduct", label: "Product to highlight", placeholder: "The hero product to feature in visuals" },
];

export function CreativeMachine({ orgId }: { orgId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [brandStep, setBrandStep] = useState(0);
  const [brief, setBrief] = useState<Brief>({});
  const [adjustment, setAdjustment] = useState("");
  const [openCampaign, setOpenCampaign] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const loaded = useRef(false);
  const load = useCallback(async () => {
    try {
      const s = await call(orgId, { action: "load" }) as unknown as State;
      setState(s);
      if (!loaded.current) {
        loaded.current = true;
        setBrief(s.brief ?? {});
        if (s.style_lock) setBrandStep(2);
      }
    } catch (e) { setErr((e as Error).message); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setErr(null);
    try { await fn(); }
    catch (e) { setErr((e as Error).message); }
    finally { await load(); setBusy(null); }
  }

  const upload = (kind: "brand" | "inspiration" | "product", campaignId: string | null) => (files: File[]) =>
    run(`upload_${kind}`, async () => {
      for (const f of files) {
        const base64 = await resizeImage(f);
        await call(orgId, { action: "add_image", kind, campaign_id: campaignId, base64 });
      }
    });
  const remove = (kind: "brand" | "inspiration" | "product", campaignId: string | null) => (url: string) =>
    run(`remove_${kind}`, () => call(orgId, { action: "remove_image", kind, campaign_id: campaignId, url }));

  if (!state) {
    return <div className="o-card px-6 py-5 text-sm text-muted-foreground">{err ?? "Loading…"}</div>;
  }
  const campaign = state.campaigns.find((c) => c.id === openCampaign) ?? null;
  const canBrief = !!(brief.brandName && brief.about && brief.target);

  return (
    <div className="space-y-5">
      {err && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}

      {/* ── Brand: brief + visual identity ── */}
      <section className="o-card px-6 py-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Brand</h2>
          {state.style_lock && brandStep === 2 && (
            <button type="button" className={ghost} onClick={() => setBrandStep(0)}>Edit brief</button>
          )}
        </div>
        {brandStep < 2 && <Stepper steps={["Brief", "Visual identity"]} current={brandStep} onPick={(i) => setBrandStep(i)} />}

        {brandStep === 0 && (
          <div className="space-y-3">
            <p className="text-[11px] text-neutral-500">
              Key information that will guide the entire visual analysis.
              {state.brief_prefilled && " Prefilled from the intake where it had something — check it before continuing."}
            </p>
            {BRIEF_FIELDS.map((f) => (
              <label key={f.key} className="block space-y-1">
                <span className="text-[11px] font-medium text-neutral-600">{f.label}</span>
                {f.textarea
                  ? <textarea rows={3} className={field} value={brief[f.key] ?? ""} placeholder={f.placeholder}
                      onChange={(e) => setBrief({ ...brief, [f.key]: e.target.value })} />
                  : <input className={field} value={brief[f.key] ?? ""} placeholder={f.placeholder}
                      onChange={(e) => setBrief({ ...brief, [f.key]: e.target.value })} />}
              </label>
            ))}
            <div className="flex justify-end">
              <button type="button" className={primary} disabled={!canBrief || !!busy}
                onClick={() => run("brief", async () => { await call(orgId, { action: "save_brief", brief }); setBrandStep(1); })}>
                {busy === "brief" ? "Saving…" : "Next →"}
              </button>
            </div>
          </div>
        )}

        {brandStep === 1 && (
          <div className="space-y-3">
            <p className="text-[11px] text-neutral-500">Upload 3 to 10 representative brand visuals. The AI will extract your BRAND_STYLE_LOCK.</p>
            <Uploader images={state.brand_images} max={10} label="Brand visuals (3-10)" busy={!!busy}
              onAdd={upload("brand", null)} onRemove={remove("brand", null)} />
            {state.style_lock && (
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-neutral-600">Adjustments (optional)</span>
                <input className={field} value={adjustment} onChange={(e) => setAdjustment(e.target.value)}
                  placeholder="e.g. The lighting is more warm golden natural light, not cold" />
              </label>
            )}
            <div className="flex gap-2">
              <button type="button" className={ghost} onClick={() => setBrandStep(0)}>← Back</button>
              <button type="button" className={primary} disabled={state.brand_images.length < 3 || !!busy}
                onClick={() => run("analyze_brand", () => call(orgId, { action: "analyze_brand", adjustment }))}>
                {busy === "analyze_brand" ? "Analyzing your brand visuals…" : state.style_lock ? "Regenerate" : "Analyze"}
              </button>
            </div>
            {state.conflicts.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900">
                <div className="font-semibold">⚠ Conflicts detected between brief and visuals</div>
                {state.conflicts.map((c, i) => <div key={i}>• {c}</div>)}
              </div>
            )}
            {state.style_lock && (
              <>
                <StyleLockCard lock={state.style_lock} />
                <div className="flex justify-end">
                  <button type="button" className={primary} onClick={() => setBrandStep(2)}>Validate & continue →</button>
                </div>
              </>
            )}
          </div>
        )}

        {brandStep === 2 && state.style_lock && (
          <p className="text-sm italic text-neutral-700">{String(state.style_lock.brand_essence ?? "")}</p>
        )}
      </section>

      {/* ── Campaigns ── */}
      {state.style_lock && brandStep === 2 && !campaign && (
        <section className="o-card px-6 py-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Campaigns</h2>
          <p className="text-[11px] text-neutral-500">A campaign is one product or product type — usually the URL a cycle is working on.</p>
          <div className="flex gap-2">
            <input className={field} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Padded push up bras" />
            <button type="button" className={primary} disabled={!!busy}
              onClick={() => run("new_campaign", async () => {
                const r = await call(orgId, { action: "new_campaign", name: newName });
                setNewName(""); setOpenCampaign(String(r.id));
              })}>+ New campaign</button>
          </div>
          {state.campaigns.length === 0 && <p className="text-[11px] text-neutral-500">No campaigns yet. Create one to start producing.</p>}
          {state.campaigns.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded border border-neutral-200 bg-white px-3 py-2 text-xs">
              <button type="button" className="flex-1 text-left" onClick={() => setOpenCampaign(c.id)}>
                <span className="font-medium text-neutral-800">{c.name}</span>
                <span className="ml-2 text-neutral-500">
                  {c.scenarios.length ? `${c.used_scenarios.length}/${c.scenarios.length} scenarios done` : "not generated yet"}
                </span>
              </button>
              <button type="button" className="text-[11px] text-red-600 hover:underline" disabled={!!busy}
                onClick={() => { if (window.confirm(`Delete campaign "${c.name}"?`)) void run("delete", () => call(orgId, { action: "delete_campaign", campaign_id: c.id })); }}>
                Delete
              </button>
            </div>
          ))}
        </section>
      )}

      {campaign && state.style_lock && (
        <CampaignFlow key={campaign.id} orgId={orgId} campaign={campaign} busy={busy}
          run={run} upload={upload} remove={remove} onBack={() => setOpenCampaign(null)} />
      )}
    </div>
  );
}

function CampaignFlow({ orgId, campaign, busy, run, upload, remove, onBack }: {
  orgId: string; campaign: Campaign; busy: string | null;
  run: (key: string, fn: () => Promise<unknown>) => Promise<void>;
  upload: (kind: "inspiration" | "product", id: string) => (files: File[]) => void;
  remove: (kind: "inspiration" | "product", id: string) => (url: string) => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState(campaign.scenarios.length > 0 ? 3 : campaign.insights ? 1 : 0);
  const [config, setConfig] = useState<Config>(campaign.config);
  const sum = config.fullHuman + config.partialHuman + config.productOnly;

  return (
    <section className="o-card px-6 py-5 space-y-4">
      <div className="flex items-center gap-2 text-xs">
        <button type="button" onClick={onBack} className="text-neutral-500 hover:underline">← Campaigns</button>
        <span className="text-neutral-300">|</span>
        <span className="font-semibold text-neutral-800">{campaign.name}</span>
      </div>
      <Stepper steps={["Inspirations", "Config", "Scenarios", "Workstation"]} current={step}
        onPick={(i) => { if (i <= 1 || (i === 2 && campaign.insights) || (i === 3 && campaign.scenarios.length)) setStep(i); }} />

      {step === 0 && (
        <div className="space-y-3">
          <p className="text-[11px] text-neutral-500">
            Upload 1 to 5 inspiration images — top pins for the keyword you are targeting. They will be filtered through your brand identity.
          </p>
          <Uploader images={campaign.inspiration_images} max={5} label="Pinterest images (1-5)" busy={!!busy}
            onAdd={upload("inspiration", campaign.id)} onRemove={remove("inspiration", campaign.id)} />
          <div className="flex gap-2">
            <button type="button" className={ghost} onClick={onBack}>← Back</button>
            <button type="button" className={primary} disabled={campaign.inspiration_images.length < 1 || !!busy}
              onClick={() => run("insp", () => call(orgId, { action: "analyze_inspiration", campaign_id: campaign.id }))}>
              {busy === "insp" ? "Analyzing your Pinterest inspirations…" : campaign.insights ? "Regenerate" : "Analyze"}
            </button>
          </div>
          {campaign.insights && (
            <>
              <div className="rounded-md border border-neutral-200 bg-white p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">IMAGE_PROMPT_INSIGHTS</div>
                <Chips data={campaign.insights} />
              </div>
              <div className="flex justify-end"><button type="button" className={primary} onClick={() => setStep(1)}>Validate & continue →</button></div>
            </>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-[11px] text-neutral-500">Define the number and distribution before generating the library.</p>
          <label className="block text-[11px] font-medium text-neutral-600">
            Total scenarios: {config.total}
            <input type="range" min={5} max={90} step={5} value={config.total} className="mt-1 w-full"
              onChange={(e) => setConfig({ ...config, total: +e.target.value })} />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {([["fullHuman", "Full human"], ["partialHuman", "Partial human"], ["productOnly", "Product only"]] as const).map(([k, l]) => (
              <label key={k} className="block space-y-1 text-[11px] text-neutral-600">
                <span>{l}</span>
                <input type="number" min={0} max={90} className={field} value={config[k]}
                  onChange={(e) => setConfig({ ...config, [k]: +e.target.value })} />
              </label>
            ))}
          </div>
          <p className={`text-[11px] font-semibold ${sum === config.total ? "text-emerald-700" : "text-red-600"}`}>
            Total: {sum}/{config.total} {sum === config.total ? "✓" : "— must equal total"}
          </p>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-neutral-600">Additional directives (optional)</span>
            <textarea rows={3} className={field} value={config.directives}
              placeholder="e.g. mostly outdoor, include at least 3 kitchen scenarios, avoid dark moods"
              onChange={(e) => setConfig({ ...config, directives: e.target.value })} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className={ghost} onClick={() => setStep(0)}>← Back</button>
            <button type="button" className={primary} disabled={sum !== config.total || !!busy}
              onClick={() => run("config", async () => { await call(orgId, { action: "save_config", campaign_id: campaign.id, config }); setStep(2); })}>
              Next →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-[11px] text-neutral-500">Upload your product image (white background ideally). The AI generates the full library.</p>
          <Uploader images={campaign.product_images} max={3} label="Product image(s) (1-3)" busy={!!busy}
            onAdd={upload("product", campaign.id)} onRemove={remove("product", campaign.id)} />
          <div className="flex gap-2">
            <button type="button" className={ghost} onClick={() => setStep(1)}>← Back</button>
            <button type="button" className={primary} disabled={campaign.product_images.length < 1 || !!busy}
              onClick={() => {
                if (campaign.scenarios.length && !window.confirm("Regenerating replaces the library and clears the done list. Continue?")) return;
                void run("scen", () => call(orgId, { action: "generate_scenarios", campaign_id: campaign.id }));
              }}>
              {busy === "scen" ? "Generating your scenario library…" : campaign.scenarios.length ? "Regenerate" : "Generate library"}
            </button>
          </div>
          {campaign.scenarios.length > 0 && (
            <>
              <div className="rounded-md border border-neutral-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-neutral-700">{campaign.scenarios.length} scenarios generated</span>
                  <button type="button" className={ghost} onClick={() => downloadTxt("scenarios-library.txt", campaign.scenarios.join("\n"))}>↓ Download .txt</button>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-neutral-100">
                  {campaign.scenarios.map((s, i) => <p key={i} className="py-1 font-mono text-[10px] text-neutral-800 whitespace-pre-wrap">{s}</p>)}
                </div>
              </div>
              <div className="flex justify-end"><button type="button" className={primary} onClick={() => setStep(3)}>Open workstation →</button></div>
            </>
          )}
        </div>
      )}

      {step === 3 && <Workstation orgId={orgId} campaign={campaign} run={run} busy={busy} />}
    </section>
  );
}

function Workstation({ orgId, campaign, run, busy }: {
  orgId: string; campaign: Campaign; busy: string | null;
  run: (key: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [filter, setFilter] = useState<"all" | "unused" | "used">("all");
  const [selected, setSelected] = useState<number | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const used = campaign.used_scenarios;
  const idOf = (s: string) => s.split("|")[0]?.trim();
  const list = campaign.scenarios.filter((s) =>
    filter === "unused" ? !used.includes(idOf(s)) : filter === "used" ? used.includes(idOf(s)) : true);

  async function prompt(s: string, markUsed: boolean) {
    return String((await call(orgId, { action: "scenario_prompt", campaign_id: campaign.id, scenario: s, mark_used: markUsed })).prompt);
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-neutral-500">
        Select a scenario → copy the prompt → paste into{" "}
        <a href="https://labs.google/fx/tools/flow" target="_blank" rel="noreferrer" className="underline">Google Flow</a>{" "}
        with the product image. Keep the result, then upload it as a design under P4.2.4.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-neutral-500">Product image for Flow:</span>
        {campaign.product_images.map((u, i) => (
          <a key={u} href={u} target="_blank" rel="noreferrer" download className="h-10 w-10 overflow-hidden rounded border border-neutral-200" title={`Product image ${i + 1} — open to save`}>
            <img src={u} alt="" className="h-full w-full object-cover" />
          </a>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {([["all", `All (${campaign.scenarios.length})`], ["unused", `To do (${campaign.scenarios.length - used.length})`], ["used", `Done (${used.length})`]] as const).map(([k, l]) => (
          <button key={k} type="button" className={filter === k ? primary : ghost} onClick={() => setFilter(k)}>{l}</button>
        ))}
        <button type="button" className={ghost} onClick={() => downloadTxt("scenarios-library.txt", campaign.scenarios.join("\n"))}>↓ Library .txt</button>
      </div>
      <div className="space-y-1">
        {list.map((s, i) => {
          const id = idOf(s);
          const isUsed = used.includes(id);
          return (
            <div key={id + i}>
              <button type="button" onClick={() => setSelected(selected === i ? null : i)}
                className={`w-full rounded-md border px-3 py-2 text-left ${selected === i ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 bg-white"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-mono text-[10px] whitespace-pre-wrap ${isUsed ? "text-neutral-400" : "text-neutral-800"}`}>{s}</span>
                  {isUsed && <span className="shrink-0 text-[10px] text-emerald-700">✓ done</span>}
                </div>
              </button>
              {selected === i && (
                <div className="flex flex-wrap gap-2 py-1.5 pl-3">
                  <button type="button" className={primary} disabled={!!busy}
                    onClick={() => run(`copy_${id}`, async () => {
                      const p = await prompt(s, true);
                      try { await navigator.clipboard.writeText(p); setCopied(true); setTimeout(() => setCopied(false), 2000); }
                      catch { setShown(p); }
                    })}>{copied ? "✓ Copied!" : "Copy prompt"}</button>
                  <button type="button" className={ghost} disabled={!!busy}
                    onClick={() => run(`view_${id}`, async () => setShown(await prompt(s, true)))}>View prompt</button>
                  <button type="button" className={ghost} disabled={!!busy}
                    onClick={() => run(`dl_${id}`, async () => downloadTxt(`prompt-${id}.txt`, await prompt(s, false)))}>↓ Download .txt</button>
                  <button type="button" className={ghost} disabled={!!busy}
                    onClick={() => run(`used_${id}`, () => call(orgId, { action: "set_used", campaign_id: campaign.id, scenario_id: id, used: !isUsed }))}>
                    {isUsed ? "Mark undone" : "Mark done"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {shown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShown(null)}>
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Prompt ready to paste into Flow</span>
              <div className="flex gap-2">
                <button type="button" className={primary}
                  onClick={async () => { try { await navigator.clipboard.writeText(shown); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* select by hand */ } }}>
                  {copied ? "✓ Copied!" : "Copy"}
                </button>
                <button type="button" className={ghost} onClick={() => setShown(null)}>Close</button>
              </div>
            </div>
            <textarea readOnly value={shown} onFocus={(e) => e.target.select()}
              className="min-h-[300px] flex-1 rounded border border-neutral-200 p-3 font-mono text-[11px] leading-relaxed" />
          </div>
        </div>
      )}
    </div>
  );
}
