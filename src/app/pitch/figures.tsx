// Getekende visuals voor secties waar geen foto of screenshot voor bestaat.
//
// Het deck houdt de regel aan dat elke sectie een eigen beeld heeft. Voor drie
// secties schreef de doorloop voor wat er moest komen (bereik, de doorgestreepte
// kanalen, de onboardingtijdlijn); de rest is afgeleid uit die regel.
//
// Alles staat hier als opmaak en niet als bestand, om twee redenen. Een getal
// dat in een PNG zit loopt stil uit de pas met het getal in de tekst ernaast,
// en dit schaalt mee met het scherm waarop gepresenteerd wordt.
//
// Cijfers komen uit pricing.ts waar ze bestaan, zodat een tarief nooit op twee
// plekken anders kan staan.

import { INVOICE_CAP, eur } from "./pricing";
import { werkFor } from "./data";
import { EN_CLAUSES } from "./en";
import { STRINGS, type Lang } from "./i18n";

// ---------------------------------------------------------------------------
// Pagina 1 · Schaalbaarheid
// ---------------------------------------------------------------------------
// Eén staafdiagram over alle markten zou niet werken: 7,5 mln naast 600 mln is
// een streepje van een procent breed. Dus twee blokken, elk met hun eigen
// vraag: hoe groot is het per markt, en hoe verhoudt het zich tot Meta.
function FigScale({ lang }: { lang: Lang }) {
  const t = STRINGS[lang].fig;
  const markets = [
    { m: t.markets.nlbe, v: "7–8", u: t.millions },
    { m: t.markets.de, v: "±20", u: t.millions },
    { m: t.markets.us, v: "±100", u: t.millions },
    { m: t.markets.world, v: "±600", u: t.millions },
  ];
  return (
    <div className="fig">
      <div className="fig-k">{t.usersPerMarket}</div>
      <div className="fig-stats">
        {markets.map((m) => (
          <div className="fig-stat" key={m.m}>
            <span className="v">
              {m.v}
              <i>{m.u}</i>
            </span>
            <span className="l">{m.m}</span>
          </div>
        ))}
      </div>

      <div className="fig-k fig-k-sep">{t.vsMeta}</div>
      <div className="fig-bars">
        <div className="fig-bar">
          <span className="nm">Pinterest</span>
          <span className="t">
            <i style={{ width: "29%" }} className="on" />
          </span>
          <span className="v">±100 {t.millions}</span>
        </div>
        <div className="fig-bar">
          <span className="nm">Meta</span>
          <span className="t">
            <i style={{ width: "100%" }} />
          </span>
          <span className="v">300–400 {t.millions}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagina 2 · Pinterest, en verder niets
// ---------------------------------------------------------------------------
function FigOnlyPinterest() {
  return (
    <div className="fig">
      <div className="fig-channels">
        {["Meta", "Google", "TikTok"].map((c) => (
          <div className="fig-ch off" key={c}>
            <span>{c}</span>
          </div>
        ))}
        <div className="fig-ch on">
          <span>Pinterest</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagina 3 · Verwachtingen
// ---------------------------------------------------------------------------
// Twee curves onder elkaar, omdat de sectie twee vragen beantwoordt: wat
// gebeurt er de eerste weken, en waar gaat het over een jaar heen. Los van
// elkaar lazen ze als twee beloftes; onder elkaar is het één verhaal met een
// tijdlijn.
function FigExpectations({ lang }: { lang: Lang }) {
  const t = STRINGS[lang].fig;
  return (
    <div className="fig">
      <div className="fig-k">{t.firstWeeks}</div>
      <FigBudgetCurve lang={lang} />
      <div className="fig-k fig-k-sep">{t.twelveMonths}</div>
      <FigRealisticBand lang={lang} />
    </div>
  );
}

// De vorm is de boodschap: eerst vlak, dan pas omhoog. Precies wat de sectie
// zegt over een algoritme dat op tijd leert en niet op spend.
function FigBudgetCurve({ lang }: { lang: Lang }) {
  const t = STRINGS[lang].fig;
  const pts = [
    [0, 78], [1, 78], [2, 77], [3, 76],
    [4, 70], [5, 62], [6, 53], [7, 44], [8, 35], [9, 27], [10, 20], [11, 14],
  ];
  const x = (i: number) => 70 + (i / 11) * 760;
  const d = pts.map(([i, y], k) => `${k === 0 ? "M" : "L"} ${x(i)} ${y * 2.1}`).join(" ");
  return (
    <div className="fig-plot">
      <svg viewBox="0 0 880 210" className="fig-svg" role="img"
        aria-label={t.budgetAria}>
        <line x1="70" y1="172" x2="830" y2="172" stroke="rgba(200,155,160,0.14)" />
        {/* De leerperiode, waar het budget bewust niet beweegt. */}
        <rect x="70" y="18" width={x(3) - 70} height="154" fill="rgba(227,6,19,0.07)" />
        <text x="76" y="34" className="fig-svg-k">{t.learning}</text>
        <path d={d} fill="none" stroke="#ff5c63" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={x(0)} cy={78 * 2.1} r="5" fill="#ff5c63" />
        <text x={x(0) + 12} y={78 * 2.1 + 5} className="fig-svg-l">{t.perDay}</text>
        <text x={x(11)} y={14 * 2.1 - 12} textAnchor="end" className="fig-svg-l">
          {t.scaleWhenRoas}
        </text>
        <text x="70" y="192" className="fig-svg-k">{t.week(1)}</text>
        <text x="830" y="192" textAnchor="end" className="fig-svg-k">{t.week(12)}</text>
      </svg>
    </div>
  );
}

// Een band in plaats van één lijn, omdat 15 tot 30 procent een bandbreedte is
// en geen belofte. Eén lijn zou een toezegging tekenen die de sectie juist
// weigert te doen.
function FigRealisticBand({ lang }: { lang: Lang }) {
  const t = STRINGS[lang].fig;
  const x = (m: number) => 70 + (m / 12) * 760;
  const y = (p: number) => 168 - (p / 32) * 140;
  const low = Array.from({ length: 13 }, (_, m) => [x(m), y(15 * (m / 12) ** 1.6)]);
  const high = Array.from({ length: 13 }, (_, m) => [x(m), y(30 * (m / 12) ** 1.2)]);
  const band =
    high.map(([a, b], i) => `${i === 0 ? "M" : "L"} ${a} ${b}`).join(" ") +
    " " +
    [...low].reverse().map(([a, b]) => `L ${a} ${b}`).join(" ") +
    " Z";
  return (
    <div className="fig-plot">
      <svg viewBox="0 0 880 210" className="fig-svg" role="img"
        aria-label={t.bandAria}>
        {[0, 10, 20, 30].map((p) => (
          <g key={p}>
            <line x1="70" y1={y(p)} x2="830" y2={y(p)} stroke="rgba(200,155,160,0.1)" />
            <text x="60" y={y(p) + 4} textAnchor="end" className="fig-svg-k">{p}%</text>
          </g>
        ))}
        <path d={band} fill="rgba(227,6,19,0.16)" stroke="none" />
        <path d={high.map(([a, b], i) => `${i === 0 ? "M" : "L"} ${a} ${b}`).join(" ")}
          fill="none" stroke="#ff5c63" strokeWidth="2" />
        <path d={low.map(([a, b], i) => `${i === 0 ? "M" : "L"} ${a} ${b}`).join(" ")}
          fill="none" stroke="#ff5c63" strokeWidth="2" strokeDasharray="4 4" />
        <text x="830" y={y(30) - 10} textAnchor="end" className="fig-svg-l">30%</text>
        <text x="830" y={y(15) + 18} textAnchor="end" className="fig-svg-l">15%</text>
        <text x="70" y="196" className="fig-svg-k">{t.month(1)}</text>
        <text x="830" y="196" textAnchor="end" className="fig-svg-k">{t.month(12)}</text>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagina 4 · Pricing
// ---------------------------------------------------------------------------
// Drie onderdelen, en bewust geen enkel bedrag (ronde 5): prijzen, percentages
// en drempels staan alleen in de calculator, één kaart verderop. Wat in de base
// fee zit komt uit dezelfde lijst als de sectie Werkzaamheden, zodat de twee
// nooit iets anders kunnen zeggen. Het startwerk staat bij de setup fee en niet
// bij de base fee: dat gebeurt eenmalig.
function FigPricingExplainer({ lang }: { lang: Lang }) {
  const t = STRINGS[lang].fig.pricing;
  const { setup, base } = werkFor(lang);
  return (
    <div className="fig">
      <div className="fig-three">
        <div className="ft">
          <span className="ft-k">{t.once}</span>
          <span className="ft-t">{t.setup}</span>
          <span className="ft-s">{t.setupLead}</span>
          <ul>
            {setup.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
        <div className="ft">
          <span className="ft-k">{t.monthly}</span>
          <span className="ft-t">{t.base}</span>
          <span className="ft-s">{t.baseLead}</span>
          <ul>
            {base.map((c) => (
              <li key={c.title}>
                <b>{c.title}</b>
                {c.items.join(" · ")}
              </li>
            ))}
          </ul>
        </div>
        <div className="ft on">
          <span className="ft-k">{t.onResult}</span>
          <span className="ft-t">{t.performance}</span>
          <span className="ft-s">{t.performanceLead}</span>
          <ul>
            {t.performanceItems.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagina 4 · Garanties
// ---------------------------------------------------------------------------
// Bewust vormgegeven als een contractblad: de sectie zegt dat dit zwart op wit
// staat, dus het beeld moet daar niet tegenin werken.
function FigGuarantees({ lang }: { lang: Lang }) {
  const t = STRINGS[lang].fig;
  const clauses: [string, string][] =
    lang === "en"
      ? EN_CLAUSES(eur(INVOICE_CAP, lang))
      : [
          [
            "KPI en target",
            "Vooraf samen vastgelegd. Jij kiest waarop we sturen: ROAS of CPA.",
          ],
          [
            "Niet gehaald",
            "De performance fee vervalt. Gemeten over de hele maand, niet per losse campagne.",
          ],
          ["Maximum", `De maandfactuur is gemaximeerd op ${eur(INVOICE_CAP)}.`],
          ["Facturatie", "Altijd achteraf, nooit vooraf."],
          ["Looptijd", "2 maanden, daarna maandelijks opzegbaar."],
        ];
  return (
    <div className="fig">
      <div className="fig-doc">
        <div className="fig-doc-head">
          <span>{t.doc.head}</span>
          <span>{t.doc.brand}</span>
        </div>
        <ol className="fig-doc-body">
          {clauses.map(([k, v]) => (
            <li key={k}>
              <span className="k">{k}</span>
              <span className="v">{v}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export const FIGURES: Record<
  string,
  (props: { lang: Lang }) => React.JSX.Element
> = {
  scale: FigScale,
  onlyPinterest: FigOnlyPinterest,
  expectations: FigExpectations,
  pricingExplainer: FigPricingExplainer,
  guarantees: FigGuarantees,
};

export type FigureKey = keyof typeof FIGURES;
