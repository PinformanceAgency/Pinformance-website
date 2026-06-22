"use client";

import { useEffect, useRef, useState } from "react";

interface Review {
  name: string;
  role: string;
  text: string;
}

const REVIEWS: Review[] = [
  {
    name: "Bram Konings",
    role: "Founder",
    text:
      "Ik werk al een tijdje samen met de mannen van Pinformance Agency en het is eerlijk gezegd een hele fijne samenwerking. Ze hebben veel kennis van Pinterest en een sterk netwerk binnen het platform. Dat merk je meteen aan hoe ze meedenken, snel schakelen en optimaliseren. Ze hebben me enorm geholpen met het opschalen van mijn merk, waarbij we multichannel zijn gaan werken, inclusief Pinterest. De media buying van Pinformance speelde een grote rol in het bereiken van onze niche. Ze denken actief mee en begrijpen zowel de Pinterest-gebruiker als de doelgroep van ons merk goed. Wat ik echt waardeer is dat ze niet alleen uitvoeren, maar ook hun kennis delen. Ze nemen je mee in hun strategie, denken mee op content-niveau en zorgen dat je écht snapt wat er gebeurt. Daardoor leer je als ondernemer in plaats van alles blind uit te besteden.",
  },
  {
    name: "Khair Chraou",
    role: "Founder",
    text:
      "Ik werk inmiddels bijna anderhalf jaar samen met Pinformance en ik kan eerlijk zeggen dat ik extreem tevreden ben over de samenwerking. Maand na maand draaien we consistent een seven-figure omzet met hele gezonde en duurzame marges die direct uit Pinterest komen. Wat er echt uitspringt is hun communicatie en de manier waarop ze écht met je merk meedenken. Ze runnen niet alleen campagnes, ze zoeken actief naar kansen om op te schalen en helpen je voor de lange termijn te groeien. Als er issues of uitdagingen zijn, komen ze snel met duidelijke oplossingen — dat geeft veel vertrouwen. Als je een serieus merk runt en echt wil opschalen, dan is Pinterest wat mij betreft een must-have kanaal. Na een paar maanden Pinterest zagen we onze blended ROAS stijgen. Niet alleen door de directe ROAS van Pinterest, maar ook door de kracht van een multichannel-setup waarbij Pinterest onze Google ROAS ook omhoog trok. Pinformance is een partner die ik zeker zou aanraden. Naast de sterke performance en consistentie is het ook gewoon leuk om op Pinterest te adverteren als je ziet hoe goed het werkt en hoe fijn het contact met het team is. Al met al een geweldige ervaring en een sterke aanrader. Thanks guys en keep on scaling 🚀",
  },
  {
    name: "Daniel Van Til",
    role: "Founder",
    text:
      "We zijn ongeveer een jaar geleden in contact gekomen met de oprichters van Pinformance, via een goede vriend die ons aanraadde om met deze mannen te praten als we wilden opschalen op Pinterest — en hij had gelijk. Ons merk zit in een niche waar Pinterest niet de voorkeur aan geeft, maar door de ervaring en goede contacten die Pinformance intern heeft, krijgen we onze ads er toch doorheen en helpen ze ons ook met onze creative strategy. De resultaten zijn ook sterk: Pinterest is verantwoordelijk voor een groot deel van de totale omzet van ons merk. Dankzij Pinformance zijn de resultaten alleen maar beter geworden.",
  },
  {
    name: "Karol Rosinski",
    role: "Founder",
    text:
      "Voor ik met Pinformance ging werken had ik wat dingen geprobeerd met Pinterest ads, maar zonder resultaat — en ik had geen tijd om een nieuw kanaal vanaf nul op te bouwen. Ik baal er nu van dat ik niet eerder met de mannen ben gaan werken, want zodra we begonnen werd Pinterest binnen 3 weken mijn belangrijkste platform, met de hoogste en meest stabiele ROAS van alle 4 platforms waar ik op draai. Als je al adverteert op andere platforms en je hebt zelf geen tijd of kennis om uit te breiden, werk dan met de mannen van Pinformance — Pinterest wordt zomaar je belangrijkste kanaal.",
  },
  {
    name: "Kain Kolenbrander",
    role: "Founder",
    text:
      "We werken inmiddels enkele maanden samen met Thijmen en Tycho en zijn erg tevreden over de samenwerking. Voor een merk is een omni-channel aanpak één van de belangrijkste groeifactoren — daarom zijn we ons Pinterest-account gestart en met Thijmen en Tycho gaan werken. De resultaten zijn goed en we zijn erg tevreden over de communicatie. Heb je een merk en wil je het gedoe van Pinterest uit handen geven, dan raad ik het samenwerken met Thijmen en Tycho zeker aan.",
  },
  {
    name: "Sinan Kaya",
    role: "Founder",
    text:
      "Deze mannen zijn ontzettend gedreven en zijn dagelijks bezig met e-commerce. Daardoor begrijpen ze de klant écht. Ik denk niet dat je een betere partner voor Pinterest ads kunt vinden.",
  },
  {
    name: "Chris Borghouts",
    role: "Founder",
    text:
      "Ik heb het genoegen om al ruim een jaar met deze mannen samen te werken. Het merk waar ik nauw bij betrokken ben is van puur Meta overgestapt naar Meta plus Pinterest als extra platform. Het is uiteindelijk net iets anders gelopen dan gepland: we geven inmiddels significant meer uit op Pinterest dan op Meta, met een substantiële verbetering in de algehele performance van het merk — en dat is dankzij deze mannen. Ze weten echt alles over Pinterest, hebben sterke connecties binnen het platform, en bovenal een waanzinnige hoeveelheid expertise in media buying en wat er specifiek nodig is om Pinterest succesvol te laten draaien. Krijg je geen resultaat, dan betaal je niet — er is dus eigenlijk geen reden om het niet te proberen. Ik weet zeker dat het voor veel andere brand founders ook een grote impact kan hebben.",
  },
  {
    name: "Dante Merlin",
    role: "Founder",
    text:
      "Uitstekende Pinterest Ads partner — een dikke aanrader. We werken nu samen met dit agency om al onze Pinterest-advertising te beheren, en de ervaring is vanaf dag één uitstekend geweest. Wij leveren de creatives aan en zij nemen al het andere volledig uit handen — campaign setup, targeting, optimalisatie, ongoing management — alles soepel geregeld. Wat ze écht onderscheidt is hun communicatie. Ze zijn altijd bereikbaar, proactief met updates en makkelijk te benaderen als we vragen hebben. We hoeven ons nooit af te vragen wat er met onze campagnes gebeurt. En het belangrijkste: de resultaten spreken voor zich. Onze Pinterest-ads presteren consistent goed en we zien echte returns op onze investering. Je merkt dat ze het platform tot in detail kennen. Zoek je een agency dat professioneel, betrouwbaar en resultaatgericht is — kijk niet verder. We zijn ontzettend blij met deze samenwerking.",
  },
];

const PREVIEW_CHARS = 220;

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Star() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="#FFB400"
      stroke="none"
      aria-hidden
      style={{ display: "block" }}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export default function ReviewsCarousel() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const updateState = () => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 8);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  useEffect(() => {
    updateState();
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => updateState();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(".rv-card");
    const step = card ? card.offsetWidth + 16 : el.clientWidth * 0.9;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const toggle = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div style={{ position: "relative" }}>
      <style>{`
        .rv-track {
          display: flex;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          scroll-behavior: smooth;
          gap: 16px;
          padding: 4px 4px 4px 4px;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .rv-track::-webkit-scrollbar { display: none; }
        .rv-card {
          flex: 0 0 86%;
          max-width: 360px;
          scroll-snap-align: start;
          background: #1a1c1f;
          border: 1px solid #2a2d31;
          border-radius: 16px;
          padding: 22px;
          color: #fff;
          display: flex;
          flex-direction: column;
          min-height: 280px;
        }
        @media (min-width: 720px) {
          .rv-card { flex: 0 0 340px; }
        }
        .rv-stars { display: flex; gap: 3px; margin-bottom: 14px; }
        .rv-text {
          font-size: 14.5px;
          line-height: 1.55;
          color: #d8dadd;
          margin: 0 0 12px;
          white-space: pre-wrap;
        }
        .rv-readmore {
          background: none; border: 0; padding: 0;
          color: #F0021A;
          font-weight: 600;
          font-size: 14px;
          text-decoration: underline;
          cursor: pointer;
          align-self: flex-start;
          margin-bottom: 18px;
        }
        .rv-readmore:hover { color: #ff3349; }
        .rv-divider { height: 1px; background: #2a2d31; margin: auto 0 16px; }
        .rv-foot { display: flex; align-items: center; gap: 12px; }
        .rv-avatar {
          width: 40px; height: 40px;
          border-radius: 50%;
          background: #2a2d31;
          color: #fff;
          font-weight: 700;
          font-size: 13px;
          letter-spacing: 0.04em;
          display: grid; place-items: center;
          flex-shrink: 0;
        }
        .rv-name { font-size: 14.5px; font-weight: 700; color: #fff; line-height: 1.2; }
        .rv-role { font-size: 13px; color: #8a8e93; margin-top: 2px; }

        .rv-arrows { display: flex; gap: 12px; justify-content: center; margin-top: 28px; }
        .rv-arrow {
          width: 48px; height: 48px;
          border-radius: 50%;
          background: #F0021A;
          border: 0;
          color: #fff;
          display: grid; place-items: center;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(240,2,26,0.35);
          transition: background .15s ease, transform .15s ease, opacity .15s ease;
        }
        .rv-arrow:hover { background: #c80216; transform: translateY(-1px); }
        .rv-arrow[disabled] { opacity: 0.35; cursor: not-allowed; transform: none; background: #F0021A; }
      `}</style>

      <div ref={trackRef} className="rv-track" aria-roledescription="carousel">
        {REVIEWS.map((r, i) => {
          const isExpanded = expanded.has(i);
          const needsTruncate = r.text.length > PREVIEW_CHARS;
          const shown =
            !needsTruncate || isExpanded
              ? r.text
              : r.text.slice(0, PREVIEW_CHARS).trimEnd() + "…";
          return (
            <article key={r.name} className="rv-card">
              <div className="rv-stars" aria-label="5 out of 5 stars">
                <Star /><Star /><Star /><Star /><Star />
              </div>
              <p className="rv-text">{shown}</p>
              {needsTruncate && (
                <button
                  type="button"
                  className="rv-readmore"
                  onClick={() => toggle(i)}
                >
                  {isExpanded ? "Toon minder" : "Lees meer"}
                </button>
              )}
              <div className="rv-divider" />
              <div className="rv-foot">
                <div className="rv-avatar" aria-hidden>
                  {initials(r.name)}
                </div>
                <div>
                  <div className="rv-name">{r.name}</div>
                  <div className="rv-role">{r.role}</div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="rv-arrows">
        <button
          type="button"
          aria-label="Previous review"
          className="rv-arrow"
          onClick={() => scrollBy(-1)}
          disabled={!canPrev}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Next review"
          className="rv-arrow"
          onClick={() => scrollBy(1)}
          disabled={!canNext}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
