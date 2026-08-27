# FASE 4 & 5 — WAT ER FEITELIJK GEDAAN MOET WORDEN

Geen ontwerp, geen scherm. Alleen: welke handelingen schrijft de SOP voor in de
twee uitvoerende fases, in welke vorm elke handeling gedaan wordt, en wat er
vandaag al achter zit. Dit is het stuk dat naast het bouwen ligt.

Bron: `ORGANIC_TASK_SPEC.md` fase 4 (regel 802–993) en fase 5 (996–1092), plus de
twee taken die als aanbeveling in OPEN ITEMS stonden en inmiddels in de bank
staan (P5.4.1 audience handover, P5.5.1 halfjaarlijkse SEO-review).

**22 taken in fase 4. 13 in fase 5. 35 totaal.**

---

## 1 · DE VORMEN

Je noemde er vier. Bij het uitschrijven bleek er een vijfde te zijn, en die is
niet klein — het is de grootste groep van fase 4. Ik zet hem er expliciet bij in
plaats van hem stilletjes onder een van de andere te schuiven.

| Code | Vorm | Wat de manager doet |
|---|---|---|
| **KNOP** | Geautomatiseerd | Het systeem doet het werk. Jij drukt op één knop, of het draait vanzelf, en je leest af. Niets terug te leveren. |
| **KEUZE** | Vastleggen in het dashboard | Je kiest uit wat het systeem voorlegt: URL's aanvinken, keywords toewijzen, borden koppelen, QC afvinken, waterfall goedkeuren. Geen tekst, geen bestand, geen knop die iets genereert — een beslissing die vastgelegd wordt. |
| **TEKST** | Uitschrijven | Er moet iets geschreven worden dat nergens anders vandaan kan komen: een oordeel, een interpretatie, een zin voor de klant. |
| **DOCUMENT** | Bestand toevoegen | Er moet een echt bestand bij: een export, een screenshot, een design. |
| **EXTERN** | Buiten het platform + terugmelden | De handeling gebeurt ergens anders (Pinterest, Canva, GA4, Looker, Ads Manager, of bij de klant) en het resultaat wordt hier gerapporteerd. |

**De belangrijkste uitkomst van deze telling:** in fase 4 en 5 samen is er maar
**op drie plekken** een document dat echt geüpload moet worden, en op **vier
plekken** vrije tekst die er toe doet. De rest is KNOP of KEUZE. Dat is precies
waarom een notitieveld met een paperclip op 22 taken zo fout aanvoelde: die vorm
past op drie van de vijfendertig.

---

## 2 · FASE 4 — MONTHLY CONTENT ENGINE

Terugkerend, één cyclus per URL. Dit is de productiemotor.

### Stap 1 — URL Selection (8 taken)

| Taak | Wat er feitelijk gebeurt | Vorm | Levert op | Nu |
|---|---|---|---|---|
| **P4.1.1** Show candidate URLs | Systeem toont de URL's die mogen: 60-daagse cooldown eraf, topic coverage gecheckt, borden toegewezen. Maand 1 begint met de top performers uit P1.2.14, daarna met de winnaars van vorige maand. Manager bladert. | KNOP | Niets | ✅ `candidates` |
| **P4.1.2** Seasonal candidates | Systeem toont URL's waarvan de piek 6–10 weken vooruit ligt. Manager beoordeelt. | KNOP | Niets | ✅ `seasonal` |
| **P4.1.3** Request new URLs | Manager vraagt de klant naar launches en nieuwe blogs. Gebeurt in de mail of op een call. Nieuwe URL's komen als NEW in de pool. | EXTERN + TEKST | Wat de klant zei, met datums | ◐ `upsert_url` bestaat, de vraag-en-terugmeldvorm niet |
| **P4.1.4** Select URLs | De kernbeslissing van de maand. Manager vinkt de URL's aan; teller loopt af tegen `urls_per_month`. Elke selectie start een cyclus. | KEUZE | De URL's van deze maand | ✅ `start_cycle` |
| **P4.1.5** Why this URL matters | Per URL één reden uit een vaste lijst: Seasonal, New, Best Performer, Client Request, Stock Push, AB Test. Server weigert alles daarbuiten. Dit is het enige waarmee je achteraf leert waarom iets niet werkte. | KEUZE (+ TEKST optioneel) | Reden per URL | ◐ enum staat er, de picker is niet af |
| **P4.1.6** Assign keywords | Max vijf per URL uit de bank (gevalideerd, klant-goedgekeurd, niet verboden), één als primary gemarkeerd. Gegridde termen bovenaan, want de design brief kan alleen formaat en kleur zetten vanaf een keyword met een grid-rij. | KEUZE | 5 keywords, 1 primary | ✅ `assign_keywords` |
| **P4.1.7** Assign boards | Minimaal vijf semantisch kloppende borden. Zwemkleding hoort niet op een strapless-bh-bord, ook al is het allebei lingerie. 180-daagse bord-URL-cooldown is er al af. | KEUZE | ≥5 borden | ✅ `assign_boards` |
| **P4.1.8** Long-tail to the design brief | Drie tot vijf beschrijvende termen uit de toegewezen set, die de tekst-overlay op de afbeelding worden. Moeten werken als zin die iemand leest, niet als keywordlijst. | KEUZE | 3–5 overlay-termen | ✗ |

### Stap 2 — Content Production (10 taken)

| Taak | Wat er feitelijk gebeurt | Vorm | Levert op | Nu |
|---|---|---|---|---|
| **P4.2.1** Grid analysis | Manager zoekt het primary keyword nú op Pinterest (incognito of PinClicks) en legt vast wat het grid op dit moment beloont. Meedoen verslaat opvallen — neonroze in een beige grid faalt. **Blokkeert de design brief tot dit er staat.** | EXTERN + TEKST + DOCUMENT (screenshot) | Grid-bevinding per keyword | ◐ gate werkt, invoervorm is een notitieveld |
| **P4.2.2** Determine route | DIRECT als de klant bruikbaar lifestyle-materiaal heeft, AI als dat er niet is. Voorgeselecteerd op de contentkwaliteit uit P1.1.7. Brief én image prompt vertakken hierop. | KEUZE (+ TEKST, één regel) | DIRECT of AI | ◐ |
| **P4.2.3** Generate design brief | Systeem stelt samen: primary + secundaire keywords, dominante hexcodes uit P2.1.4 én de verse gridcheck, formaat, overlay ja/nee, de 80/20 save-click-verdeling, merkkleuren, typografie, overlay-hook, safe zones, schreefloos. Pure assemblage van opgeslagen waarden. | KNOP | Niets — lezen en doorgeven | ✅ `brief` |
| **P4.2.4** Create four designs | Vier visueel verschillende designs. **Twee routes, twee vormen.** AI-route: systeem genereert ze (Krea). DIRECT-route: de designer bouwt ze in Canva/Figma en ze worden geüpload. Op de AI-route: 1% transparante rand vóór export om C2PA-metadata te strippen, en nooit "Mark as AI-Modified" aanzetten. | KNOP (AI) **of** EXTERN + DOCUMENT (direct) | 4 designs | ◐ AI-pad staat er, geblokkeerd op Krea-saldo. Upload-pad ontbreekt |
| **P4.2.5** Generate fresh copies | Micro-crop op kopie B, C en D van elk design. Zestien varianten. De afbeelding is het zwaarste versheidssignaal na de URL — dit houdt distributie op 64–77% in plaats van 11–35%. | KNOP | 16 varianten | ✅ `generate_crops` |
| **P4.2.6** File names | Lowercase, koppeltekens, primary keyword erin. Verborgen SEO-signaal: Pinterest leest bestandsnamen met OCR. | KNOP | Niets — controleren of ze de export overleefden | ✅ `fileNameFor` |
| **P4.2.7** Design QC | Zeven punten afvinken: kleuren matchen het grid, overlay-regel gerespecteerd, vier écht verschillende designs, alleen schreefloos, safe zones vrij, bestandsnamen correct, geen watermerk, geen AI-label. Kan niet stilzwijgend overgeslagen worden. | KEUZE (checklist) + TEKST bij afkeur | Wat QC ving | ◐ `design_qc` is goed/afkeur, de zevenpuntslijst niet |
| **P4.2.8** Generate copy | Vier sets per URL, één per design — de vier crops van een design delen hun tekst, want beeld weegt zwaarder dan tekst. Elke set: on-pin tagline (4–9 woorden, max 12, met primary keyword), pin-titel, pin-beschrijving, waar nodig bordbeschrijving. Manager bewerkt en keurt goed. Opnieuw genereren zet de goedkeuring terug. | KNOP + KEUZE (goedkeuren) + TEKST (bewerken) | 4 goedgekeurde sets | ✅ `generate_copy` |
| **P4.2.9** Run validators | Blokkeert, waarschuwt niet: titel max 100 met keyword vooraan, beschrijving 250–300, geen em-dash, en-dash, uitroepteken of hashtag, tagline binnen de woordgrens, geen URL-shorteners, geen handmatige UTM. | KNOP (automatisch) | Niets — een fail noemt de regel | ✅ `validate_copy` |
| **P4.2.10** Copy QC | Alleen wat een validator niet kan beoordelen: klinkt het als het merk, past het bij de afbeelding, maakt de landingspagina het waar, zijn de vier sets echt verschillend. | KEUZE + TEKST | Oordeel per set | ◐ `copy_qc` |

### Stap 3 — Waterfall Planning (2 taken)

| Taak | Wat er feitelijk gebeurt | Vorm | Levert op | Nu |
|---|---|---|---|---|
| **P4.3.1** Generate waterfall | Zestien pins: 4 designs × 4 verse kopieën. Bordrotatie per offset — `(design_index + copy_index) % aantal borden` — zodat elk bord vier pins van vier verschillende designs krijgt. Interval tussen pins van hetzelfde design = aantal designs × spacing (4 dagen established, 8 nieuw). Dit is waarvoor het hele systeem bestaat. | KNOP | Niets — de spreiding controleren | ✅ `waterfall` |
| **P4.3.2** Approve waterfall | Manager kijkt naar de spreiding op een kalender vóór er iets ingepland wordt. Systeem toont de design-bord-matrix en botsingen met andere lopende cycli tegen het dagelijkse pin-doel. **Zonder deze goedkeuring wordt niets ingepland.** | KEUZE (akkoord) + TEKST bij afwijking | Goedkeuring, plus reden bij gewijzigde spacing of startdatum | ✗ kalender ontbreekt |

### Stap 4 — Scheduling (2 taken)

| Taak | Wat er feitelijk gebeurt | Vorm | Levert op | Nu |
|---|---|---|---|---|
| **P4.4.1** Schedule on Pinterest | Publiceren via de Pinterest API. Altijd standaard pins, nooit simplified of idea — die worden nauwelijks gedistribueerd. Respecteert de spacing-trigger, het dagvolume en de harde grens van 20/dag. | KNOP | Niets | ✗ **stub** — `pushWaterfallToPinterest` geeft `queued: 0, mode: "handoff-todo"` terug |
| **P4.4.2** Monitor publishing | Systeem vlagt fouten, wacht af bij rate limits, meldt verlopende tokens vóór ze een cyclus breken. Manager handelt: een rate limit lost zichzelf op, een dode token niet — die moet opnieuw gekoppeld worden. | KNOP + EXTERN bij dode token | Niets, tenzij er iets faalde | ✗ geen job |

---

## 3 · FASE 5 — MONTHLY REVIEW & REPORTING

Maandelijks. Sluit de lus terug naar fase 4.

### Stap 1 — Data & Reporting (4 taken)

| Taak | Wat er feitelijk gebeurt | Vorm | Levert op | Nu |
|---|---|---|---|---|
| **P5.1.1** Pull Pinterest analytics | Ophalen met vaste filters: Organic + Claimed Domain + Your Pins, realtime uit. Dertien KPI's inclusief page visits, add to cart, checkouts, conversies en omzet uit Conversion Insights. Your Pins en Other Pins apart. | KNOP | Niets — controleren dat de filters klopten | ✗ **geen pull** — niets schrijft `organic.pin_performance` behalve de seedscripts |
| **P5.1.2** Pull GA4 data | Sessieduur, bouncepercentage, pagina's per sessie, engagement rate voor Pinterest-verkeer. GA4 meet kwaliteit, nooit volume. | EXTERN + DOCUMENT (export) | De GA4-export | ✗ |
| **P5.1.3** Explain the attribution gap | Meer dan 80% van Pinterest gebeurt in de in-app browser, waar de referral-tag wegvalt; dat verkeer landt in GA4 als direct. Het gat wordt berekend. Wat hier hoort is de zin die vóór de klant komt — want elke klant vraagt ernaar. | KNOP (het gat) + TEKST (de zin) | Het gat in cijfers + de zin | ◐ gat wordt berekend, de zin niet vastgelegd |
| **P5.1.4** Update Looker Studio | Cijfers in het Looker-template van de klant: kanaaloverzicht, organic-uitsplitsing, Pinterest-paneel, on-site kwaliteit. De vergelijking met de rest van het kanaal is het punt. | EXTERN + TEKST | De link, en wat er veranderde | ✗ |

### Stap 2 — Creative Optimisation (3 taken)

| Taak | Wat er feitelijk gebeurt | Vorm | Levert op | Nu |
|---|---|---|---|---|
| **P5.2.1** Identify winners | Top 3–5 op outbound clicks, en apart op saves. Nooit op impressies — die zeggen niets over intentie. Click-winnaars zeggen welke lay-out je hergebruikt, save-winnaars welke fotografie je herhaalt. | KNOP | Niets — lezen | ◐ berekening staat er, draait op seed-data |
| **P5.2.2** Analyse winning combinations | Welk design op welk bord werkte, en waarom. Prestatie teruggekoppeld aan élke beslissing: design, copy set, keyword, bord, bordbreedte, en de "waarom deze URL"-reden. Dit is wat cyclus twee beter maakt dan cyclus één. | TEKST | De interpretatie | ◐ |
| **P5.2.3** Update the design brief | Winnende templates op *proven* zetten, zodat de productie van volgende maand ze hergebruikt. Elke klant convergeert op een handvol lay-outs die werken. | KEUZE | Welke proven, wat retired | ✅ `set_template_proven` |

### Stap 3 — Trends & Roadmap (4 taken)

| Taak | Wat er feitelijk gebeurt | Vorm | Levert op | Nu |
|---|---|---|---|---|
| **P5.3.1** Check Pinterest Trends | trends.pinterest.com voor de markt van de klant. Wat stijgt voor de komende 60–90 dagen, over yearly, monthly en growing. Nieuwe termen komen als ongevalideerde kandidaat in de bank. | EXTERN + TEKST | De stijgende termen, en welke bij de taste graph passen | ✗ |
| **P5.3.2** Check Shopping Trends | Welke productcategorieën stijgen in de niche. Dit is advies waar de klant iets mee kan voor voorraad en focus. | EXTERN + TEKST | De categorieën, als advies | ✗ |
| **P5.3.3** Future insights for the client | Wat op Pinterest stijgt, stijgt weken later op Google. Systeem stelt de vooruitblik op uit de trendchecks, de taste graph en wat hier gewonnen heeft; manager keurt goed. Dit maakt van rapportage advies. | KNOP + TEKST (bewerken) | De vooruitblik | ✅ `draft_forecast` |
| **P5.3.4** Next month roadmap | Winnaars + stijgende trends + seizoenstermen waarvan het venster opengaat + URL's uit cooldown = de kandidatenlijst. De cirkel sluit. | KEUZE + TEKST | Kandidatenlijst voor volgende maand | ✗ |

### Stap 4 & 5 (2 taken)

| Taak | Wat er feitelijk gebeurt | Vorm | Levert op | Nu |
|---|---|---|---|---|
| **P5.4.1** Organic-to-Paid handover | Zes audiences in Ads Manager: pin engagers 30/60/90 dagen en drie site-visitor-audiences. Exporteren en overdragen aan paid. **Nooit via de Promote-knop** — een organische pin boosten mengt organic en paid in dezelfde pin-data en sloopt de ROI-rapportage. | EXTERN + TEKST (datum) | De zes audiences + overdrachtsdatum | ✗ |
| **P5.5.1** SEO strategy review | Elk half jaar: de volledige keywordbank, de bordarchitectuur en de concurrentenset. Wat niet presteert gaat eruit. | KEUZE + TEKST | Wat retired is en wat ervoor in de plaats kwam | ✗ |

---

## 4 · DE TELLING

Meervoudig getelde taken (KNOP óf EXTERN, KEUZE + TEKST) staan bij elke vorm die
ze raken, dus de som ligt boven 35.

| Vorm | Fase 4 | Fase 5 | Totaal |
|---|---|---|---|
| **KNOP** | 11 | 4 | **15** |
| **KEUZE** | 10 | 3 | **13** |
| **TEKST** (als eigen bijdrage) | 7 | 9 | **16** |
| **EXTERN** | 4 | 5 | **9** |
| **DOCUMENT** | 2 | 1 | **3** |

Drie conclusies die het bouwen sturen:

1. **KNOP en KEUZE zijn samen bijna alles.** Bij zevenentwintig van de
   vijfendertig taken is de hoofdhandeling "druk hier" of "kies hieruit". Dat
   zijn twee componenten, niet vijfendertig schermen.
2. **DOCUMENT komt drie keer voor:** het grid-screenshot (P4.2.1), de designs op
   de directe route (P4.2.4), de GA4-export (P5.1.2). Meer niet. Een uploadveld
   op elke taak is ruis.
3. **TEKST is bijna nooit het hele antwoord.** Op alle zestien plekken waar
   geschreven wordt, hangt de tekst aan een keuze of aan een externe handeling.
   Losse tekst zonder die verankering komt één keer voor: P5.2.2, de
   interpretatie van de winnaars. Dat is de enige taak in fase 4 en 5 waar een
   leeg tekstveld de juiste vorm is.

---

## 5 · WAT ER VANDAAG ECHT STAAT

Nagelopen in de code, niet in de taakomschrijvingen.

**Werkt (13 van de 35):** `candidates`, `seasonal`, `start_cycle`,
`assign_keywords`, `assign_boards`, `brief`, `generate_crops`, `fileNameFor`,
`generate_copy`, `validate_copy`, `waterfall`, `set_template_proven`,
`draft_forecast`.

**Half (10):** P4.1.3, P4.1.5, P4.2.1, P4.2.2, P4.2.4, P4.2.7, P4.2.10, P5.1.3,
P5.2.1, P5.2.2 — er staat iets, maar in de verkeerde vorm of op fictieve data.

**Ontbreekt (12):** P4.1.8, P4.3.2, P4.4.1, P4.4.2, P5.1.1, P5.1.2, P5.1.4,
P5.3.1, P5.3.2, P5.3.4, P5.4.1, P5.5.1.

**Vier gaten die het verschil maken tussen een demo en een motor:**

1. **`pushWaterfallToPinterest` is een lege huls.** `src/lib/organic/phase4.ts:667`
   geeft `{ queued: 0, mode: "handoff-todo" }` terug. De knop staat er, de API
   antwoordt netjes, en er gaat niets naar Pinterest. De hele fase 4 eindigt in
   een no-op. Dit is het eerste dat af moet.
2. **Er is geen enkele organic-cron.** `vercel.json` noemt organic niet. Dus
   P4.4.2 (publicatie bewaken), P5.1.1 (analytics ophalen) en de verversing
   waar P5.2.1 op leunt hebben geen motor.
3. **Fase 5 draait op seed-data.** Alleen `scripts/demo-store.ts` en
   `scripts/seed-phase4-walkthrough.ts` schrijven `organic.pin_performance`.
   Elke winnaar, elke sparkline en elk rapport komt uit fictie.
4. **De phase5-API heeft drie acties voor dertien taken.** Tien taken hebben geen
   backend.

Plus: de AI-designroute (P4.2.4) staat er maar loopt vast op het Krea-saldo, en
de uploadroute voor klanten mét eigen materiaal bestaat helemaal niet — terwijl
dat volgens P4.2.2 de te verkiezen route is als de klant materiaal heeft.

---

## 6 · WAARMEE WE HET BOUWEN

Per vorm één component, en per component wat we uit het bestaande dashboard
overnemen in plaats van opnieuw te verzinnen.

| Vorm | Eén component | Overnemen uit |
|---|---|---|
| **KNOP** | Knop + resultaatpaneel + foutregel. Draaien, wachten, tonen wat eruit kwam. | `src/app/(dashboard)/pipeline/page.tsx` — stapstatus, spinner, foutafhandeling per stap |
| **KEUZE** | Lijst met selectie + telbalk + actiebalk onderaan. Werkt voor URL's, keywords, borden, QC-punten en templates. | `src/app/(dashboard)/pins/page.tsx` — filterbalk, checkbox-selectie, bulk-actiebalk |
| **KEUZE (kalender)** | Weekraster met pins per dag, slepen om te verschuiven. Precies wat P4.3.2 vraagt. | `src/app/(dashboard)/calendar/page.tsx` |
| **TEKST** | Tekstveld dat vasthangt aan de keuze waar het bij hoort, niet een los notitieveld op de taak. | `task_answers` bestaat al |
| **DOCUMENT** | Uploadveld — alleen op de drie taken die het nodig hebben. | `assets` + Supabase Storage, al in gebruik |
| **EXTERN** | Kaart met de tool, een directe link erheen, en het veld waarin je terugmeldt. | Bestaat al als `external`-kind |

En voor de vier gaten:

- **P4.4.1 publiceren** → `/api/cron/post-pins` doet dit al voor het hoofd­dashboard.
  De organische pins moeten diezelfde weg op.
- **P5.1.1 analytics** → `/api/cron/pull-analytics` en `/api/cron/snapshot-metrics`
  doen dit al. Er moet een organic-variant naast, mét een regel in `vercel.json`.
- **P4.2.4 AI-route** → `/api/ai/generate-images` (Krea) en
  `src/lib/image/overlay.ts` staan er.
- **P4.2.8 copy** → `runContentPipeline` in `src/lib/ai/pipelines/content-pipeline.ts`.

---

## 7 · VOLGORDE

1. P4.4.1 echt laten publiceren. Zonder dat is de rest theater.
2. De organic-cron voor publicatiebewaking (P4.4.2) en analytics (P5.1.1) —
   daarmee stopt fase 5 met op fictie draaien.
3. De KEUZE-component één keer goed, en hem dan op alle dertien taken zetten.
4. De KNOP-component gelijktrekken met `pipeline/page.tsx`.
5. De drie uploadplekken, de acht externe kaarten.
6. De ontbrekende backends van fase 5 (tien taken).
