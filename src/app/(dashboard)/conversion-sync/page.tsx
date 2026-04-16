"use client";

import { useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { CheckCircle2, Copy, ExternalLink } from "lucide-react";

export default function ConversionSyncPage() {
  const { org } = useOrg();
  const [copied, setCopied] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const orgSlug = org?.slug || "";
  const pinterestUserId = org?.pinterest_user_id || "";

  // Simple one-liner script for Pinterest console
  const script = `fetch('/graphql/',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},body:JSON.stringify({queryHash:'8f5b2a4aaff21d586877d949973d8cc468082d161d81bb337928c63e3274d27a',queryName:'v3AnalyticsTopConversionPinsGraphqlQuery',variables:{user:'${pinterestUserId}',paid:'2',inProfile:'2',fromOwnedContent:'2',appTypes:'all',startDate:new Date(Date.now()-30*86400000).toISOString().split('T')[0],endDate:new Date().toISOString().split('T')[0],metricType:'totalPurchases',clickWindowDays:'30',viewWindowDays:'1'}})}).then(r=>r.json()).then(d=>{const pins=d?.data?.v3AnalyticsTopConversionPinsGraphqlQuery?.data?.totalPurchases||[];let c=0,rev=0;pins.forEach(p=>{if(p?.metadata?.paidList?.includes(false)){c+=p?.metrics?.totalPurchases||0;rev+=p?.metrics?.totalRevenue||0}});fetch('${apiUrl}/api/pinterest/conversion-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:'78e6de4155a7f02d5bc60ee3fda7c8b1',org_slug:'${orgSlug}',conversions:{checkouts:c,revenue:rev,end_date:new Date().toISOString().split('T')[0]}})}).then(r=>r.json()).then(r=>console.log('Sync result:',r))})`;

  async function copyScript() {
    await navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!orgSlug || !pinterestUserId) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold">Conversion Sync</h1>
        <p className="text-muted-foreground mt-2">
          Verbind eerst je Pinterest account op de{" "}
          <a href="/integrations" className="text-primary hover:underline">Integrations</a> pagina.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Conversion Sync</h1>
        <p className="text-muted-foreground mt-1">
          Haal organic conversion data op uit Pinterest naar je dashboard.
        </p>
      </div>

      <div className="glass-card rounded-xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-full bg-primary text-white text-sm flex items-center justify-center flex-shrink-0">1</span>
          <div>
            <p className="font-medium">Open Pinterest Conversion Insights</p>
            <a
              href="https://www.pinterest.com/conversion-insights/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1 mt-1"
            >
              pinterest.com/conversion-insights
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-full bg-primary text-white text-sm flex items-center justify-center flex-shrink-0">2</span>
          <div>
            <p className="font-medium">Open de Console (rechtermuisklik → Inspecteren → Console tab)</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-full bg-primary text-white text-sm flex items-center justify-center flex-shrink-0">3</span>
          <div className="flex-1">
            <p className="font-medium mb-2">Plak dit script en druk Enter</p>
            <div className="relative">
              <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto max-h-24 font-mono">
                {script}
              </pre>
              <button
                onClick={copyScript}
                className="absolute top-2 right-2 px-2 py-1 bg-background border border-border rounded text-xs flex items-center gap-1 hover:bg-muted transition"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    Gekopieerd
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Kopieer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-border/50 text-xs text-muted-foreground">
          <p><strong>Account:</strong> {org?.name} (@{pinterestUserId})</p>
          <p><strong>Data:</strong> Laatste 30 dagen &middot; 30-day click / 1-day view &middot; Organic only</p>
        </div>
      </div>
    </div>
  );
}
