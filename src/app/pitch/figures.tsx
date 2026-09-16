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

import {
  BASE_FEE,
  BRACKETS,
  INVOICE_CAP,
  MIN_ADSPEND_FOR_FEE,
  SETUP_FEE,
  eur,
  quote,
} from "./pricing";

// ---------------------------------------------------------------------------
// Pagina 1 · Schaal, eerlijk
// ---------------------------------------------------------------------------
// Eén staafdiagram over alle markten zou niet werken: 7,5 mln naast 600 mln is
// een streepje van een procent breed. Dus twee blokken, elk met hun eigen
// vraag: hoe groot is het per markt, en hoe verhoudt het zich tot Meta.
function FigScale() {
  const markets = [
    { m: "NL + BE", v: "7–8", u: "mln" },
    { m: "Duitsland", v: "±20", u: "mln" },
    { m: "Verenigde Staten", v: "±100", u: "mln" },
    { m: "Wereldwijd", v: "±600", u: "mln" },
  ];
  return (
    <div className="fig">
      <div className="fig-k">Gebruikers per markt</div>
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

      <div className="fig-k fig-k-sep">In de Verenigde Staten, naast Meta</div>
      <div className="fig-bars">
        <div className="fig-bar">
          <span className="nm">Pinterest</span>
          <span className="t">
            <i style={{ width: "29%" }} className="on" />
          </span>
          <span className="v">±100 mln</span>
        </div>
        <div className="fig-bar">
          <span className="nm">Meta</span>
          <span className="t">
            <i style={{ width: "100%" }} />
          </span>
          <span className="v">300–400 mln</span>
        </div>
      </div>
      <p className="fig-note">
        Kleiner, en dat is het punt: minder concurrentie en CPM&apos;s die fors
        onder Meta liggen.
      </p>
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
      <p className="fig-note">
        Geen tweede kanaal om op terug te vallen. Alles wat wij leren komt hier
        terecht.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagina 3 · Verwachtingen
// ---------------------------------------------------------------------------
// De vorm is de boodschap: eerst vlak, dan pas omhoog. Precies wat de sectie
// zegt over een algoritme dat op tijd leert en niet op spend.
function FigExpectations() {
  const pts = [
    [0, 78], [1, 78], [2, 77], [3, 76],
    [4, 70], [5, 62], [6, 53], [7, 44], [8, 35], [9, 27], [10, 20], [11, 14],
  ];
  const x = (i: number) => 70 + (i / 11) * 760;
  const d = pts.map(([i, y], k) => `${k === 0 ? "M" : "L"} ${x(i)} ${y * 2.1}`).join(" ");
  return (
    <div className="fig">
      <svg viewBox="0 0 880 210" className="fig-svg" role="img"
        aria-label="Budget blijft de eerste weken vlak en loopt daarna op">
        <line x1="70" y1="172" x2="830" y2="172" stroke="rgba(200,155,160,0.14)" />
        {/* De leerperiode, waar het budget bewust niet beweegt. */}
        <rect x="70" y="18" width={x(3) - 70} height="154" fill="rgba(227,6,19,0.07)" />
        <text x="76" y="34" className="fig-svg-k">Leerperiode</text>
        <path d={d} fill="none" stroke="#ff5c63" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={x(0)} cy={78 * 2.1} r="5" fill="#ff5c63" />
        <text x={x(0) + 12} y={78 * 2.1 + 5} className="fig-svg-l">€ 100–200 per dag</text>
        <text x={x(11)} y={14 * 2.1 - 12} textAnchor="end" className="fig-svg-l">
          Schalen zodra de ROAS het toelaat
        </text>
        <text x="70" y="192" className="fig-svg-k">Week 1</text>
        <text x="830" y="192" textAnchor="end" className="fig-svg-k">Week 12</text>
      </svg>
      <p className="fig-note">
        Het algoritme leert op tijd, niet op spend. Budget dumpen in week één
        levert slechte data op waar je de rest van het kwartaal last van houdt.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagina 3 · Onboarding
// ---------------------------------------------------------------------------
function FigOnboarding() {
  const steps = [
    { n: "01", t: "Setup fee betaald", time: "Geen tijd" },
    { n: "02", t: "Slack en Notion", time: "15 tot 20 min" },
    { n: "03", t: "Kick-off call", time: "30 tot 45 min" },
    { n: "04", t: "Eerste campagnes live", time: "Binnen 48 uur" },
  ];
  return (
    <div className="fig">
      <div className="fig-time">
        {steps.map((s, i) => (
          <div className="fig-step" key={s.n}>
            <span className="d">
              <i />
              {i < steps.length - 1 && <u />}
            </span>
            <span className="num">{s.n}</span>
            <span className="t">{s.t}</span>
            <span className="h">{s.time}</span>
          </div>
        ))}
      </div>
      <p className="fig-note">
        Vier stappen, en 15 tot 20 minuten werk aan jouw kant. De rest doen wij,
        als jij snel schakelt staan de eerste campagnes binnen 48 uur live.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagina 4 · Wat realistisch is
// ---------------------------------------------------------------------------
// Een band in plaats van één lijn, omdat 15 tot 30 procent een bandbreedte is
// en geen belofte. Eén lijn zou een toezegging tekenen die de sectie juist
// weigert te doen.
function FigRealistic() {
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
    <div className="fig">
      <svg viewBox="0 0 880 210" className="fig-svg" role="img"
        aria-label="Aandeel van de advertentieomzet loopt over twaalf maanden op naar 15 tot 30 procent">
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
        <text x="70" y="196" className="fig-svg-k">Maand 1</text>
        <text x="830" y="196" textAnchor="end" className="fig-svg-k">Maand 12</text>
      </svg>
      <p className="fig-note">
        Het aandeel van je advertentieomzet, opgebouwd over maanden. Bij het ene
        merk gaat het binnen weken, bij het andere duurt het langer.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagina 5 · Niet gehaald, niet betaald
// ---------------------------------------------------------------------------
function FigTwoScenarios() {
  const example = 25_000;
  const q = quote(example);
  return (
    <div className="fig">
      <div className="fig-k">
        Voorbeeld bij {eur(example)} ad spend per maand
      </div>
      <div className="fig-scen">
        <div className="fs on">
          <span className="k">Target gehaald</span>
          <span className="v">{eur(q.totalOnTarget)}</span>
          <span className="r">
            <i>Base fee</i>
            {eur(BASE_FEE)}
          </span>
          <span className="r">
            <i>Spend fee · {q.bracketPct}%</i>
            {eur(q.spendFee)}
          </span>
        </div>
        <div className="fs off">
          <span className="k">Target niet gehaald</span>
          <span className="v">{eur(q.totalOffTarget)}</span>
          <span className="r">
            <i>Base fee</i>
            {eur(BASE_FEE)}
          </span>
          <span className="r struck">
            <i>Spend fee</i>
            {eur(q.spendFee)}
          </span>
        </div>
      </div>
      <p className="fig-note">
        De setup fee en de base fee blijven staan. Alleen de fee over je ad spend
        vervalt, en dat wordt per periode beoordeeld.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagina 5 · Garanties
// ---------------------------------------------------------------------------
// Bewust vormgegeven als een contractblad: de sectie zegt dat dit zwart op wit
// staat, dus het beeld moet daar niet tegenin werken.
function FigGuarantees() {
  const clauses = [
    ["KPI en target", "Vooraf samen vastgelegd. Jij kiest waarop we sturen."],
    ["Beoordeling", "Per periode, niet per campagne."],
    ["Niet gehaald", `De spend fee vervalt. Je betaalt ${eur(BASE_FEE)} base fee.`],
    ["Drempel", `Onder ${eur(MIN_ADSPEND_FOR_FEE)} ad spend per maand geen spend fee.`],
    ["Maximum", `De factuur is gemaximeerd op ${eur(INVOICE_CAP)} per maand.`],
    ["Facturatie", "Altijd achteraf, nooit vooraf."],
    ["Looptijd", "2 maanden, daarna maandelijks opzegbaar."],
  ];
  return (
    <div className="fig">
      <div className="fig-doc">
        <div className="fig-doc-head">
          <span>Overeenkomst</span>
          <span>Pinformance</span>
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
// Prijs en calculator · Wat zit erin
// ---------------------------------------------------------------------------
function FigWhatsIncluded() {
  // Niet de tien onderdelen herhalen: die staan een paar centimeter hoger al.
  // Wat de sectie mist is de kostenopbouw eronder, en dat is precies wat een
  // prospect hier wil zien staan.
  const cards = [
    {
      k: "Eenmalig",
      t: "Setup fee",
      v: eur(SETUP_FEE),
      s: "Onderzoek, organic opzet, advertentieaccount, creative gameplan en de kick-off.",
    },
    {
      k: "Per maand",
      t: "Base fee",
      v: eur(BASE_FEE),
      s: "Media buying, organic beheer, wekelijkse rapportage en de maandelijkse call.",
    },
    {
      k: "Op resultaat",
      t: "Spend fee",
      v: `${BRACKETS[0].pct}% → ${BRACKETS[BRACKETS.length - 1].pct}%`,
      s: `Over je ad spend, lager naarmate je schaalt. Vervalt als de KPI niet gehaald wordt, en de factuur stopt bij ${eur(INVOICE_CAP)}.`,
      accent: true,
    },
  ];
  return (
    <div className="fig">
      <div className="fig-k">Waar je geld heen gaat</div>
      <div className="fig-three">
        {cards.map((c) => (
          <div className={`ft${c.accent ? " on" : ""}`} key={c.t}>
            <span className="ft-k">{c.k}</span>
            <span className="ft-t">{c.t}</span>
            <span className="ft-v">{c.v}</span>
            <span className="ft-s">{c.s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export const FIGURES: Record<string, () => React.JSX.Element> = {
  scale: FigScale,
  onlyPinterest: FigOnlyPinterest,
  expectations: FigExpectations,
  onboarding: FigOnboarding,
  realistic: FigRealistic,
  twoScenarios: FigTwoScenarios,
  guarantees: FigGuarantees,
  whatsIncluded: FigWhatsIncluded,
};

export type FigureKey = keyof typeof FIGURES;
