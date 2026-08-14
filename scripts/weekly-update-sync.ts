/**
 * Pinformance - Weekly Update Sync
 * ================================
 * Schrijft per store de weekcijfers (spend, revenue) vanuit Pinterest naar de
 * subitems van het Monday-bord "Weekly Updates".
 *
 * Draait wekelijks: maandag 12:00 Europe/Amsterdam.
 *
 * ARCHITECTUUR
 * ------------
 *     dashboard backend (heeft Pinterest app + tokens + per-klant config)
 *         |
 *         |  fetchWeekMetrics()   <- DIT MOET JE ZELF KOPPELEN
 *         v
 *     dit script  ->  Monday GraphQL API  ->  subitem per store per week
 *
 * De Monday-kant hieronder is geverifieerd tegen het echte bord.
 * De Pinterest-kant is een interface: hij verwacht dat jouw dashboard al een
 * functie heeft die analytics ophaalt. Zie fetchWeekMetrics().
 *
 * WAT DIT SCRIPT NIET DOET
 * ------------------------
 * - Het verstuurt geen berichten naar klanten. Het vult alleen het bord.
 * - Het raakt de klantregel (parent item) niet aan, alleen subitems.
 *
 * DRAAIEN
 * -------
 *     DOTENV_CONFIG_PATH=.env.local npx tsx scripts/weekly-update-sync.ts
 */

import 'dotenv/config';
import { Client as PgClient, types as pgTypes } from 'pg';
import { decrypt } from '../src/lib/encryption';
import { PinterestClient } from '../src/lib/pinterest/client';

// node-pg maakt van een DATE-kolom een JS Date op LOKALE middernacht, die
// vervolgens als de VORIGE dag terugserialiseert zodra de process-TZ niet UTC
// is. We lezen snapshot_date, dus dezelfde parser als in team-activity.ts.
pgTypes.setTypeParser(1082, (val) => val);

// Naast MONDAY_API_TOKEN heeft dit script uit .env.local nodig:
//   DATABASE_URL    voor de koppeltabel (organizations + store_settings)
//   ENCRYPTION_KEY  om het opgeslagen Pinterest-token te ontsleutelen

// ---------------------------------------------------------------------------
// CONFIGURATIE
// ---------------------------------------------------------------------------

const MONDAY_API_URL = 'https://api.monday.com/v2';
const MONDAY_API_VERSION = '2024-10';

const MONDAY_TOKEN = process.env.MONDAY_API_TOKEN;
if (!MONDAY_TOKEN) {
  throw new Error('MONDAY_API_TOKEN ontbreekt. Zet hem in .env.local.');
}

// Bord-ID's (geverifieerd)
const BOARD_WEEKLY_UPDATES = 5091362359; // klantregels
const BOARD_WEEKLY_SUBITEMS = 5091487606; // de weekregels

// Kolom-ID's op het SUBITEM-bord (geverifieerd tegen live data)
const COL_TIMERANGE = 'timerange_mm0d1drh'; // timeline: de week
const COL_SPEND = 'numeric_mm0dje2n'; // spend deze week
const COL_REVENUE = 'numeric_mm0dgayk'; // revenue deze week
const COL_SPEND_PREV = 'numeric_mm0qz9qs'; // spend vorige week (voedt de WoW-formule)
const COL_SEND_DATE = 'date_mm0rkas9'; // datum waarop de update de deur uit gaat
// ROAS (formula_mm0qb00) en WoW-% (formula_mm0gpbmy) berekent Monday zelf.
// Die NIET schrijven.

// Kolom-ID's op het KLANT-bord
const COL_ATTRIBUTION = 'color_mm66jxan'; // status: 30/1, 30/7, 30/30, Shopify Revenue + Refunds
const COL_AD_ACCOUNT = 'text_mm66z84h'; // Pinterest ad account ID -- de matchsleutel
const COL_CURRENCY = 'text_mm0qxxnt'; // "€", "$", "£", "CHF"
const COL_TYPE = 'color_mm39qrqt'; // Brand / Dropship
const GROUP_ACTIVE = 'topics'; // actieve stores; 'group_mm0dg4k0' = Inactive Stores

// Attributielabel -> Pinterest-vensters in dagen (click, view, engagement).
const ATTRIBUTION_WINDOWS: Record<string, [number, number, number]> = {
  '30/1': [30, 1, 30],
  '30/7': [30, 7, 30],
  '30/30': [30, 30, 30],
};

// Weekgrens: maandag t/m zondag (0 = maandag).
// LET OP: alle weken op het bord van vóór deze wijziging lopen zondag t/m
// zaterdag. De eerste week na de omschakeling is dus niet 1-op-1 te
// vergelijken met de week ervoor.
const WEEK_STARTS_ON = 0;

// Late conversies blijven binnenkomen zolang het attributievenster open staat.
// Deze snapshot wordt bevroren. Zet op true als je na 30 dagen eenmalig wilt
// herzien (schrijft de oude week opnieuw met de dan bekende cijfers).
const REVISE_AFTER_WINDOW_CLOSES = false;

// Stores met dit attributielabel krijgen ALLEEN spend automatisch ingevuld.
// Hun revenue komt uit Shopify (incl. refunds) en is niet uit Pinterest te
// halen -- die vult Tristan handmatig aan. Spend staat los van attributie en
// is dus wel gewoon te syncen.
// Op het bord staan 11 actieve stores met dit label, allemaal dropship, maar in
// de log zie je er 7 (gemeten 14-08-2026). Dat verschil is geen bug: run()
// filtert eerst op koppeling en pas daarna op attributielabel. Een store zonder
// werkende Pinterest-koppeling wordt met `continue` afgevangen vóórdat
// isSpendOnly() ooit wordt aangeroepen, en belandt dus in de lijst
// "NOG NIET GEKOPPELD, VOLLEDIG HANDMATIG" in plaats van in
// "REVENUE HANDMATIG AANVULLEN". De 4 die ontbreken zitten daar.
// Zodra hun koppeling er is, schuiven ze vanzelf naar de spend-only-lijst.
const SPEND_ONLY_ATTRIBUTION_LABELS = new Set(['Shopify Revenue + Refunds']);

// Draai eerst met DRY_RUN = true. Dan wordt er niets naar Monday geschreven,
// maar zie je in de log precies wat er weggeschreven zou worden.
const DRY_RUN = true;

// ---------------------------------------------------------------------------
// LOGGING
// ---------------------------------------------------------------------------

const log = {
  info: (msg: string) => console.log(`INFO ${msg}`),
  warning: (msg: string) => console.warn(`WARNING ${msg}`),
  error: (msg: string) => console.error(`ERROR ${msg}`),
  exception: (msg: string, err: unknown) => {
    console.error(`ERROR ${msg}`);
    console.error(err instanceof Error ? err.stack : err);
  },
};

// ---------------------------------------------------------------------------
// DATUM-HELPERS
// ---------------------------------------------------------------------------
//
// Alles werkt op UTC-middernacht zodat er geen zomertijd-drift optreedt.
// Een "date" is hier altijd een Date op 00:00:00Z.

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/** 0 = maandag ... 6 = zondag (zelfde conventie als Python's date.weekday()). */
function weekday(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Engelse maandnaam, gelijk aan Python's strftime("%B") in de C-locale. */
function monthName(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    timeZone: 'UTC',
  }).format(d);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// DATAMODEL
// ---------------------------------------------------------------------------

/** Eén regel uit je dashboard-database. Dashboard is bron van waarheid. */
export interface ClientConfig {
  storeName: string; // alleen voor logging, NIET om op te matchen
  mondayItemId: number; // de klantregel op board 5091362359
  pinterestAdAccountId: string; // de harde matchsleutel
  attributionLabel: string; // "30/1", "30/7", "30/30", "Shopify Revenue + Refunds"
  clickWindowDays: number; // 30
  viewWindowDays: number; // 1, 7, of 30
  engagementWindowDays: number; // meestal gelijk aan click
  active: boolean;
}

/**
 * True als alleen spend geschreven mag worden, niet revenue.
 *
 * Twee gevallen:
 * - Shopify-stores: revenue komt niet uit Pinterest.
 * - Stores zonder attributie-instelling: we weten het venster niet, dus
 *   revenue zou een gok zijn. Spend is altijd veilig.
 */
export function isSpendOnly(client: ClientConfig): boolean {
  if (!client.attributionLabel) {
    return true;
  }
  return SPEND_ONLY_ATTRIBUTION_LABELS.has(client.attributionLabel);
}

export interface WeekMetrics {
  spend: number;
  revenue: number;
}

/**
 * De store staat wel actief in Monday, maar het dashboard heeft nog geen
 * werkende koppeling met dit Pinterest ad account.
 *
 * Dit is geen fout maar een normale toestand: na onboarding duurt het
 * doorgaans een week (soms twee) voordat de klant het account daadwerkelijk
 * toewijst. Tot die tijd vult Tristan die store handmatig in; zodra de
 * koppeling er is, pakt de sync hem vanzelf op.
 */
export class AdAccountNotConnected extends Error {
  constructor(adAccountId: string, reason?: string) {
    super(
      `Ad account ${adAccountId} is niet gekoppeld${reason ? `: ${reason}` : ''}`,
    );
    this.name = 'AdAccountNotConnected';
  }
}

// ---------------------------------------------------------------------------
// 1. WEEKVENSTER BEPALEN
// ---------------------------------------------------------------------------

/**
 * De laatste volledig afgeronde week vóór vandaag.
 *
 * Bij WEEK_STARTS_ON = 6 (zondag) en today = maandag 2026-08-31
 * levert dit 2026-08-23 (zo) t/m 2026-08-29 (za).
 * De zondag ertussenin (30-08) valt bewust buiten het venster: die hoort
 * bij de week die nog loopt.
 *
 * NB: WEEK_STARTS_ON staat hierboven op 0 (maandag). Bij today = maandag
 * 2026-08-31 levert dit dus 2026-08-24 (ma) t/m 2026-08-30 (zo).
 */
export function previousFullWeek(today: Date): { start: Date; end: Date } {
  const daysSinceStart = (weekday(today) - WEEK_STARTS_ON + 7) % 7;
  const currentWeekStart = addDays(today, -daysSinceStart);
  const start = addDays(currentWeekStart, -7);
  const end = addDays(start, 6);
  return { start, end };
}

// ---------------------------------------------------------------------------
// 2. PINTEREST -- KOPPELPUNT MET JE DASHBOARD
// ---------------------------------------------------------------------------

/**
 * >>> OPTIONEEL, MAAR AANBEVOLEN -- KOPPELPUNT MET JE DASHBOARD. <<<
 *
 * Geef de ad account ID's terug waarvoor het dashboard een werkende
 * koppeling heeft (geldig token, account daadwerkelijk toegewezen).
 *
 * Waarom apart: een ad account ID in Monday betekent alleen dat wij weten
 * welk account het is -- niet dat de klant het al aan onze app heeft
 * toegewezen. Na onboarding zit daar meestal een week tussen.
 *
 * Eén query op de tabel waar je dashboard zijn koppelingen bijhoudt --
 * DEZELFDE BRON als de Configured / Not connected status in het dashboard.
 * Zoek die op in de repo; schrijf hem niet opnieuw.
 *
 * Return null als je dit niet wilt implementeren. Dan valt het script terug
 * op de AdAccountNotConnected-exception uit fetchWeekMetrics(); dat werkt
 * ook, maar kost een mislukte API-call per niet-gekoppelde store.
 */
export async function connectedAdAccountIds(): Promise<Set<string> | null> {
  const index = await dashboardLinks();

  const ids = new Set<string>();
  for (const [adAccountId, link] of index.byAdAccount) {
    if (linkProblem(link) === null) {
      ids.add(adAccountId);
    }
  }

  log.info(
    `Koppelingen: ${index.coveredOrgs}/${index.connectedOrgs} orgs gedekt, ` +
      `${index.fallbackOrgs.length} vallen terug op handmatig`,
  );
  for (const f of index.fallbackOrgs) {
    log.info(`  handmatig: ${f.orgName} -- ${f.reason}`);
  }

  return ids;
}

// --- de koppeltabel --------------------------------------------------------

interface DashboardLink {
  orgId: string;
  orgName: string;
  adAccountId: string;
  tokenEncrypted: string;
  tokenExpiresAt: string | null;
  isTrial: boolean;
  /** Laatste dag waarop een cron dit ad account voor deze org zag. */
  lastSeen: string;
}

/**
 * Ad account ID -> de org waarmee je hem mag bevragen. Eén query, nul
 * Pinterest-calls.
 *
 * WAAROM DE SNAPSHOT-TABELLEN EN NIET organizations / store_settings
 * ------------------------------------------------------------------
 * De voor de hand liggende bron is `organizations` (+ `store_settings`): daar
 * baseert het dashboard zijn Not connected / Configured-badge op, zie
 * src/app/api/media-buying/store-settings/route.ts:44-76. Voor de vraag "is er
 * een koppeling?" klopt dat ook. Maar voor "welk ad account hoort erbij?" is
 * die bron vrijwel leeg, gemeten op 14-08-2026:
 *
 *     50   orgs met een Pinterest-koppeling (pinterest_user_id IS NOT NULL)
 *      3   daarvan met een opgeslagen ad account ID
 *          (2x organizations.settings->>'pinterest_ad_account_id',
 *           1x store_settings.ad_account_id)
 *     44   orgs met een ad account ID in pinterest_metrics_snapshots (30d)
 *     48   orgs met een ad account ID in pinterest_entity_snapshots (30d)
 *
 * Het dashboard bewaart dat ID namelijk nergens structureel: elke route lost
 * het per aanroep opnieuw op via selectAdAccount() -> client.getAdAccounts()
 * (src/lib/pinterest/select-ad-account.ts:19-54), met het opgeslagen ID als
 * voorkeur en anders naam-matching. Op 3 van de 50 draaien betekent dat 47
 * stores onterecht als "niet gekoppeld" wegvallen -- de sync doet dan niets.
 *
 * De snapshot-crons schrijven het opgeloste ad account wél weg, per org, per
 * dag (`ad_account_id NOT NULL` in beide tabellen). Dat is daarmee de enige
 * plek in de database die de mapping compleet heeft. We combineren ze: entity
 * dekt 48 orgs, metrics 44, samen 48. De 2 orgs die dan nog ontbreken hebben
 * al maanden geen snapshot -- dode tokens, zie CLAUDE.md "Known issues" 1.
 *
 * Een org zonder recente snapshot is geen fout maar een normale toestand:
 * fetchWeekMetrics() gooit AdAccountNotConnected en de store belandt in de
 * handmatige lijst, niet in de foutenlijst.
 */
const LINKS_QUERY = `
  WITH seen AS (
    SELECT org_id, ad_account_id, MAX(snapshot_date) AS last_seen
      FROM (
        SELECT org_id, ad_account_id, snapshot_date
          FROM pinterest_entity_snapshots
         WHERE snapshot_date > CURRENT_DATE - $1::int
        UNION ALL
        SELECT org_id, ad_account_id, snapshot_date
          FROM pinterest_metrics_snapshots
         WHERE snapshot_date > CURRENT_DATE - $1::int
      ) u
     GROUP BY org_id, ad_account_id
  )
  SELECT o.id::text                           AS org_id,
         o.name                               AS org_name,
         o.pinterest_access_token_encrypted   AS token_encrypted,
         o.pinterest_token_expires_at         AS token_expires_at,
         o.settings->>'pinterest_access_tier' AS access_tier,
         seen.ad_account_id                   AS ad_account_id,
         seen.last_seen                       AS last_seen
    FROM organizations o
    LEFT JOIN seen ON seen.org_id = o.id
   WHERE o.pinterest_user_id IS NOT NULL
   ORDER BY o.name, seen.last_seen DESC NULLS LAST
`;

/**
 * Hoe ver we terugkijken in de snapshots. Ruim genomen: het ad account van een
 * store verandert vrijwel nooit, en een cron die een paar dagen overslaat mag
 * niet betekenen dat we de koppeling kwijtraken.
 */
const SNAPSHOT_LOOKBACK_DAYS = 30;

interface LinkIndex {
  byAdAccount: Map<string, DashboardLink>;
  /** Orgs met een Pinterest-koppeling in het dashboard. */
  connectedOrgs: number;
  /** Orgs waarvoor we een bruikbaar ad account hebben. */
  coveredOrgs: number;
  /** Orgs die terugvallen op handmatig invullen, met reden. */
  fallbackOrgs: Array<{ orgName: string; reason: string }>;
}

let linksCache: LinkIndex | null = null;

async function dashboardLinks(): Promise<LinkIndex> {
  if (linksCache) {
    return linksCache;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL ontbreekt. Zet hem in .env.local.');
  }
  const pg = new PgClient({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();
  let rows: Array<Record<string, unknown>>;
  try {
    ({ rows } = await pg.query(LINKS_QUERY, [SNAPSHOT_LOOKBACK_DAYS]));
  } finally {
    await pg.end();
  }

  const byAdAccount = new Map<string, DashboardLink>();
  const covered = new Set<string>();
  const fallbackOrgs: Array<{ orgName: string; reason: string }> = [];
  const connectedOrgIds = new Set<string>();
  // Reden per org, alleen bewaard als de org géén enkel bruikbaar account heeft.
  const problemByOrg = new Map<string, { orgName: string; reason: string }>();

  for (const r of rows) {
    const orgId = String(r.org_id);
    connectedOrgIds.add(orgId);

    const link: DashboardLink = {
      orgId,
      orgName: String(r.org_name ?? ''),
      adAccountId: r.ad_account_id ? String(r.ad_account_id).trim() : '',
      tokenEncrypted: (r.token_encrypted as string | null) ?? '',
      tokenExpiresAt:
        r.token_expires_at instanceof Date
          ? r.token_expires_at.toISOString()
          : ((r.token_expires_at as string | null) ?? null),
      isTrial: r.access_tier === 'trial',
      lastSeen: String(r.last_seen ?? '').slice(0, 10),
    };

    if (!link.adAccountId) {
      problemByOrg.set(orgId, {
        orgName: link.orgName,
        reason: `geen ad account in de snapshots van de laatste ${SNAPSHOT_LOOKBACK_DAYS} dagen`,
      });
      continue;
    }

    const problem = linkProblem(link);
    if (problem) {
      problemByOrg.set(orgId, { orgName: link.orgName, reason: problem });
      // Toch indexeren: dan kan fetchWeekMetrics() de échte reden noemen
      // ("token verlopen op ...") in plaats van "geen koppeling".
    }

    // Zelfde ad account op twee verschillende orgs: dan weten we niet welk
    // token erbij hoort. Meld het en houd de eerste aan (ORDER BY o.name maakt
    // dat deterministisch). Komt in de praktijk voor -- gemeten 14-08-2026: 1x.
    const existing = byAdAccount.get(link.adAccountId);
    if (existing) {
      if (existing.orgId !== link.orgId) {
        log.warning(
          `Ad account ${link.adAccountId} hangt aan zowel "${existing.orgName}" als "${link.orgName}" -- eerste aangehouden`,
        );
        // Zonder dit zou deze org uit de telling vallen: niet gedekt, maar ook
        // niet als handmatig gemeld. Stil gat, precies wat je niet wilt.
        problemByOrg.set(orgId, {
          orgName: link.orgName,
          reason: `ad account ${link.adAccountId} wordt al geclaimd door "${existing.orgName}"`,
        });
      }
      continue;
    }
    byAdAccount.set(link.adAccountId, link);
    if (!problem) {
      covered.add(orgId);
    }
  }

  for (const [orgId, p] of problemByOrg) {
    if (!covered.has(orgId)) {
      fallbackOrgs.push(p);
    }
  }
  fallbackOrgs.sort((a, b) => a.orgName.localeCompare(b.orgName));

  linksCache = {
    byAdAccount,
    connectedOrgs: connectedOrgIds.size,
    coveredOrgs: covered.size,
    fallbackOrgs,
  };
  return linksCache;
}

/** null = koppeling is bruikbaar; anders de reden waarom niet. */
function linkProblem(link: DashboardLink): string | null {
  if (!link.tokenEncrypted) {
    return 'geen Pinterest-token in het dashboard';
  }
  if (link.tokenExpiresAt && new Date(link.tokenExpiresAt) < new Date()) {
    return `token verlopen op ${link.tokenExpiresAt.slice(0, 10)}`;
  }
  return null;
}

/**
 * >>> HIER KOPPEL JE JE BESTAANDE DASHBOARD-CODE IN. <<<
 *
 * Je dashboard doet deze call al succesvol; die wil je niet twee keer
 * schrijven. Vervang de body hieronder door een aanroep van je eigen
 * analytics-functie.
 *
 * Wat er sowieso doorgegeven moet worden aan Pinterest (Ads API v5,
 * endpoint /ad_accounts/{ad_account_id}/analytics):
 *
 *     start_date, end_date        YYYY-MM-DD
 *     granularity                 TOTAL
 *     columns                     SPEND_IN_MICRO_DOLLAR,
 *                                 TOTAL_CONVERSIONS_VALUE_IN_MICRO_DOLLAR
 *                                 (exacte kolomnamen: check je dashboard)
 *     click_window_days           client.clickWindowDays
 *     engagement_window_days      client.engagementWindowDays
 *     view_window_days            client.viewWindowDays
 *     conversion_report_time      TIME_OF_CONVERSION
 *
 * LET OP -- conversion_report_time is een keuze met gevolgen. Tristan heeft
 * TIME_OF_CONVERSION bevestigd; dat is ook wat er nu handmatig wordt
 * overgetypt, dus de automatisering reproduceert de bestaande cijfers.
 *   TIME_OF_CONVERSION  conversie telt in de week dat hij plaatsvond.
 *                       Stabiel: een afgesloten week verandert nauwelijks nog.
 *                       Maar: ROAS per week is niet zuiver, want de spend die
 *                       de conversie veroorzaakte kan in een eerdere week staan.
 *                       Bij een store die hard op- of afschaalt vertekent dat.
 *   TIME_OF_AD_ACTION   conversie telt mee in de week van de klik.
 *                       Zuivere ROAS, maar cijfers stijgen achteraf nog na.
 * Verifieer welke je dashboard nu daadwerkelijk gebruikt -- als dat afwijkt
 * van TIME_OF_CONVERSION, wijken de cijfers af van wat je handmatig invulde.
 *
 * GEVERIFIEERD (14-08-2026): het dashboard stuurt TIME_OF_CONVERSION mee.
 * src/lib/pinterest/client.ts:451 -- getAdAccountAnalytics zet
 *   conversion_report_time: opts.conversionReportTime ?? "TIME_OF_CONVERSION"
 * Dezelfde default staat op regel 523 (getAdAnalytics), 601
 * (getCampaignAnalytics) en 673 (getAdGroupAnalytics). Geen enkele aanroeper
 * geeft TIME_OF_AD_ACTION door; alleen /api/pinterest/ads-performance
 * (route.ts:93-95) kan er via een querystring op omschakelen, en dat pad staat
 * los van deze sync. Er valt hier dus niets recht te zetten.
 *
 * TWEE AFWIJKINGEN OP DE SPEC HIERBOVEN (bewust, voor pariteit):
 * - Kolom is SPEND_IN_DOLLAR, niet SPEND_IN_MICRO_DOLLAR, en revenue is
 *   TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR. Alleen die laatste deel je door
 *   1_000_000 (zie snapshot-metrics/route.ts:85-87).
 * - engagement_window_days wordt niet meegestuurd; zie de notitie onder
 *   fetchWeekMetrics().
 *
 * Bedragen komen in micro's van de accountvaluta: deel door 1_000_000.
 *
 * TIJDZONE -- makkelijk over het hoofd te zien:
 * Pinterest rapporteert per dag in de tijdzone van het AD ACCOUNT, niet in
 * Europe/Amsterdam. Bij accounts in de VS loopt "2026-08-31" dus 6-9 uur uit
 * de pas met jouw maandag. Als spend structureel een paar procent afwijkt van
 * wat je handmatig overtypte, is dit vrijwel altijd de oorzaak.
 * Controleer de tijdzone-instelling per ad account voordat je conclusies
 * trekt over de attributie-instellingen.
 *
 * BELANGRIJK: gooi AdAccountNotConnected als er (nog) geen werkende
 * koppeling is voor dit ad account -- geen token, token verlopen, of het
 * account is nog niet aan onze app toegewezen. Gooi daarvoor GEEN generieke
 * exception, want dan belandt een gewoon nieuwe store in de foutenlijst
 * in plaats van in de handmatige lijst.
 */
export async function fetchWeekMetrics(
  client: ClientConfig,
  start: Date,
  end: Date,
): Promise<WeekMetrics> {
  const adAccountId = client.pinterestAdAccountId;

  const link = (await dashboardLinks()).byAdAccount.get(adAccountId);
  if (!link) {
    throw new AdAccountNotConnected(
      adAccountId,
      `niet gezien in de snapshots van de laatste ${SNAPSHOT_LOOKBACK_DAYS} dagen`,
    );
  }
  const problem = linkProblem(link);
  if (problem) {
    throw new AdAccountNotConnected(adAccountId, problem);
  }

  let token: string;
  try {
    token = decrypt(link.tokenEncrypted);
  } catch {
    // Onleesbaar token = in de praktijk geen werkende koppeling; de klant moet
    // opnieuw verbinden via /integrations. Geen foutenlijst-geval.
    throw new AdAccountNotConnected(
      adAccountId,
      'token niet te ontsleutelen -- opnieuw verbinden',
    );
  }

  const pinterest = new PinterestClient(token, link.isTrial);

  // Bewust GEEN selectAdAccount(): Monday levert het ad account ID als harde
  // matchsleutel, en die fallback zou bij een niet-toegewezen account stilletjes
  // een ánder account van dezelfde klant kiezen. Liever AdAccountNotConnected.
  let resp: unknown;
  try {
    resp = await pinterest.getAdAccountAnalytics(
      adAccountId,
      isoDate(start),
      isoDate(end),
      {
        granularity: 'TOTAL',
        clickWindowDays: attributionWindow(client.clickWindowDays, 30),
        viewWindowDays: attributionWindow(client.viewWindowDays, 1),
        // conversion_report_time wordt bewust niet meegegeven: de default in
        // getAdAccountAnalytics is al TIME_OF_CONVERSION (client.ts:451).
        // engagement_window_days bestaat niet als optie op deze functie -- zie
        // de notitie onderaan dit blok.
      },
    );
  } catch (err) {
    if (isAccessError(err)) {
      throw new AdAccountNotConnected(
        adAccountId,
        `Pinterest weigert toegang (${accessErrorStatus(err)}) -- account nog niet aan onze app toegewezen of token ingetrokken`,
      );
    }
    throw err;
  }

  const row = totalsRow(resp);
  if (!row) {
    // Lege respons = geen data in dit venster (bijv. account stond stil).
    return { spend: 0, revenue: 0 };
  }

  // SPEND_IN_DOLLAR staat al in accountvaluta-eenheden, niet in micro's --
  // dat is ook hoe snapshot-metrics/route.ts:85-87 het leest. Alleen de
  // conversiewaarde komt in micro's binnen.
  const spend = num(row['SPEND_IN_DOLLAR']);
  const revenue = num(row['TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR']) / 1_000_000;
  return { spend, revenue };
}

// engagement_window_days: getAdAccountAnalytics accepteert die parameter niet
// en stuurt hem ook niet mee (zie de toelichting bij getAdAnalytics,
// client.ts:527-529: Campaign Manager toont het niet in de 30/1-instelling,
// dus laat het dashboard Pinterest zelf defaulten). client.engagementWindowDays
// wordt daarom niet doorgegeven. Dat is geen omissie in dit script maar een
// bewuste keuze in de gedeelde client; wil je het alsnog, dan is dat een
// wijziging in src/lib/pinterest/client.ts die álle dashboardcijfers raakt.

/** Pinterest accepteert alleen deze vensterlengtes. */
function attributionWindow(
  days: number,
  fallback: 1 | 7 | 14 | 30 | 60,
): 1 | 7 | 14 | 30 | 60 {
  const allowed = [1, 7, 14, 30, 60] as const;
  const hit = allowed.find((d) => d === days);
  if (!hit) {
    log.warning(
      `Attributievenster ${days} dagen wordt niet ondersteund door Pinterest -- ${fallback} gebruikt`,
    );
    return fallback;
  }
  return hit;
}

function num(v: unknown): number {
  if (v == null || v === '') {
    return 0;
  }
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

/**
 * granularity=TOTAL levert een array met één rij, maar Pinterest schakelt
 * afhankelijk van de endpointversie soms over op { all: { daily_metrics } }.
 * Beide vormen afvangen, net als media-buying/route.ts:202-210.
 */
function totalsRow(resp: unknown): Record<string, number | string> | null {
  if (Array.isArray(resp)) {
    return (resp[0] as Record<string, number | string>) ?? null;
  }
  const daily = (
    resp as {
      all?: { daily_metrics?: Array<{ metrics: Record<string, number> }> };
    }
  )?.all?.daily_metrics;
  if (!Array.isArray(daily) || daily.length === 0) {
    return null;
  }
  // Zou bij TOTAL niet moeten voorkomen; als het toch gebeurt, optellen zodat
  // we geen weekcijfer op één dag baseren.
  const summed: Record<string, number> = {};
  for (const d of daily) {
    for (const [k, v] of Object.entries(d.metrics ?? {})) {
      summed[k] = (summed[k] ?? 0) + num(v);
    }
  }
  return summed;
}

/**
 * PinterestClient.request() gooit `Error("Pinterest API error <status>: ...")`
 * (client.ts:176-179). 401/403 = token dood of ingetrokken, 404 = het ad
 * account is niet zichtbaar voor onze app. Alle drie zijn "nog niet gekoppeld",
 * geen echte fout.
 */
const ACCESS_ERROR_RE = /Pinterest API error (401|403|404)\b/;

function accessErrorStatus(err: unknown): string {
  const m = err instanceof Error ? ACCESS_ERROR_RE.exec(err.message) : null;
  return m ? m[1] : '?';
}

function isAccessError(err: unknown): boolean {
  return err instanceof Error && ACCESS_ERROR_RE.test(err.message);
}

// ---------------------------------------------------------------------------
// 3. MONDAY
// ---------------------------------------------------------------------------

async function mondayQuery(
  query: string,
  variables: Record<string, unknown>,
): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const resp = await fetch(MONDAY_API_URL, {
      method: 'POST',
      body: JSON.stringify({ query, variables }),
      headers: {
        Authorization: MONDAY_TOKEN as string,
        'API-Version': MONDAY_API_VERSION,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new Error(`Monday HTTP ${resp.status} ${resp.statusText}`);
    }

    const body = await resp.json();
    if (body.errors) {
      throw new Error(`Monday API error: ${JSON.stringify(body.errors)}`);
    }
    return body.data;
  } finally {
    clearTimeout(timeout);
  }
}

const EXISTING_SUBITEMS = `
query ($itemId: [ID!]) {
  items (ids: $itemId) {
    subitems {
      id
      name
      column_values (ids: ["timerange_mm0d1drh", "numeric_mm0dje2n"]) {
        id
        text
      }
    }
  }
}
`;

interface ExistingWeek {
  id: string;
  spend: string | null;
}

/** Bestaande weken per store, gesleuteld op 'YYYY-MM-DD - YYYY-MM-DD'. */
export async function existingWeekSubitems(
  mondayItemId: number,
): Promise<Record<string, ExistingWeek>> {
  const data = await mondayQuery(EXISTING_SUBITEMS, {
    itemId: [String(mondayItemId)],
  });
  const items = data?.items ?? [];
  if (items.length === 0) {
    return {};
  }

  const result: Record<string, ExistingWeek> = {};
  for (const sub of items[0].subitems ?? []) {
    const cols: Record<string, string | null> = {};
    for (const c of sub.column_values) {
      cols[c.id] = c.text;
    }
    const key = (cols[COL_TIMERANGE] ?? '').trim();
    if (key) {
      result[key] = { id: sub.id, spend: cols[COL_SPEND] ?? null };
    }
  }
  return result;
}

const CREATE_SUBITEM = `
mutation ($parentId: ID!, $name: String!, $cols: JSON!) {
  create_subitem (parent_item_id: $parentId, item_name: $name, column_values: $cols) {
    id
  }
}
`;

const UPDATE_SUBITEM = `
mutation ($boardId: ID!, $itemId: ID!, $cols: JSON!) {
  change_multiple_column_values (board_id: $boardId, item_id: $itemId, column_values: $cols) {
    id
  }
}
`;

export function buildColumnValues(
  start: Date,
  end: Date,
  metrics: WeekMetrics,
  spendPrev: number | null,
  writeRevenue = true,
): string {
  const cols: Record<string, unknown> = {
    [COL_TIMERANGE]: { from: isoDate(start), to: isoDate(end) },
    [COL_SPEND]: round2(metrics.spend),
    [COL_SEND_DATE]: { date: isoDate(addDays(end, 1)) },
  };
  if (writeRevenue) {
    cols[COL_REVENUE] = round2(metrics.revenue);
  }
  // Bij spend-only laten we COL_REVENUE bewust ongemoeid: leeg als het
  // subitem nieuw is, en een handmatig ingevulde waarde blijft staan als
  // het subitem al bestond.
  if (spendPrev !== null) {
    cols[COL_SPEND_PREV] = round2(spendPrev);
  }
  return JSON.stringify(cols);
}

/** Idempotent: bestaat de week al, dan bijwerken in plaats van dubbel aanmaken. */
export async function writeWeek(
  client: ClientConfig,
  start: Date,
  end: Date,
  metrics: WeekMetrics,
): Promise<string> {
  const existing = await existingWeekSubitems(client.mondayItemId);
  const key = `${isoDate(start)} - ${isoDate(end)}`;

  const prevStart = addDays(start, -7);
  const prevKey = `${isoDate(prevStart)} - ${isoDate(addDays(prevStart, 6))}`;
  const prevRaw = existing[prevKey]?.spend;
  const spendPrev =
    prevRaw !== undefined && prevRaw !== null && prevRaw !== ''
      ? parseFloat(prevRaw)
      : null;

  const cols = buildColumnValues(
    start,
    end,
    metrics,
    spendPrev,
    !isSpendOnly(client),
  );

  if (key in existing) {
    if (!REVISE_AFTER_WINDOW_CLOSES) {
      log.info(
        `${client.storeName}: week ${key} bestaat al, bevroren -- overgeslagen`,
      );
      return existing[key].id;
    }
    await mondayQuery(UPDATE_SUBITEM, {
      boardId: String(BOARD_WEEKLY_SUBITEMS),
      itemId: existing[key].id,
      cols,
    });
    log.info(`${client.storeName}: week ${key} herzien`);
    return existing[key].id;
  }

  const data = await mondayQuery(CREATE_SUBITEM, {
    parentId: String(client.mondayItemId),
    name: monthName(start),
    cols,
  });
  log.info(`${client.storeName}: week ${key} aangemaakt`);
  return data.create_subitem.id;
}

// ---------------------------------------------------------------------------
// 4. RUN
// ---------------------------------------------------------------------------

const ACTIVE_CLIENTS = `
query ($boardId: [ID!], $groupId: String!) {
  boards (ids: $boardId) {
    groups (ids: [$groupId]) {
      items_page (limit: 200) {
        items {
          id
          name
          column_values (ids: ["color_mm66jxan", "text_mm66z84h", "text_mm0qxxnt"]) {
            id
            text
          }
        }
      }
    }
  }
}
`;

/**
 * Leest de klantenlijst rechtstreeks uit het Monday-bord.
 *
 * Monday is hier de operationele lijst: wie er actief is, welk attributie-
 * venster geldt en welk Pinterest ad account erbij hoort. Daarmee is er geen
 * aparte tabel in de dashboard-database nodig -- één plek om te onderhouden,
 * en de media buyer ziet in Monday direct wat er geldt.
 *
 * Stores zonder ad account ID worden overgeslagen met een waarschuwing: die
 * kunnen we niet ophalen zonder op naam te matchen, en dat doen we bewust niet.
 */
export async function loadClients(): Promise<ClientConfig[]> {
  const data = await mondayQuery(ACTIVE_CLIENTS, {
    boardId: [String(BOARD_WEEKLY_UPDATES)],
    groupId: GROUP_ACTIVE,
  });

  const clients: ClientConfig[] = [];
  for (const item of data.boards[0].groups[0].items_page.items) {
    const cols: Record<string, string> = {};
    for (const c of item.column_values) {
      cols[c.id] = (c.text ?? '').trim();
    }
    const adAccount = cols[COL_AD_ACCOUNT] ?? '';
    const label = cols[COL_ATTRIBUTION] ?? '';

    if (!adAccount) {
      log.warning(`${item.name} heeft geen ad account ID -- overgeslagen`);
      continue;
    }

    const [click, view, engagement] = ATTRIBUTION_WINDOWS[label] ?? [30, 1, 30];
    clients.push({
      storeName: item.name,
      mondayItemId: parseInt(item.id, 10),
      pinterestAdAccountId: adAccount,
      attributionLabel: label,
      clickWindowDays: click,
      viewWindowDays: view,
      engagementWindowDays: engagement,
      active: true,
    });
  }

  log.info(`${clients.length} actieve stores geladen uit Monday`);
  return clients;
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

function padNum(n: number, width: number): string {
  const s = n.toFixed(2);
  return s.length >= width ? s : ' '.repeat(width - s.length) + s;
}

export async function run(today?: Date): Promise<void> {
  const day = today ?? todayUtc();
  const { start, end } = previousFullWeek(day);
  log.info(`Week ${isoDate(start)} t/m ${isoDate(end)}`);

  if (DRY_RUN) {
    log.warning('DRY RUN -- er wordt niets naar Monday geschreven.');
  }

  const connected = await connectedAdAccountIds();
  if (connected !== null) {
    log.info(`${connected.size} gekoppelde ad accounts bekend in het dashboard`);
  }

  let ok = 0;
  const spendOnly: string[] = [];
  const notConnected: string[] = [];
  const failed: string[] = [];

  for (const client of await loadClients()) {
    if (!client.active) {
      continue;
    }

    // Vooraf filteren als het dashboard kan vertellen wat gekoppeld is.
    if (connected !== null && !connected.has(client.pinterestAdAccountId)) {
      notConnected.push(client.storeName);
      continue;
    }

    let metrics: WeekMetrics;
    try {
      metrics = await fetchWeekMetrics(client, start, end);
    } catch (exc) {
      if (exc instanceof AdAccountNotConnected) {
        // Vangnet voor als connectedAdAccountIds() niet geïmplementeerd is.
        notConnected.push(client.storeName);
        continue;
      }
      // per klant falen mag de rest niet blokkeren
      log.exception(`${client.storeName} gefaald`, exc);
      failed.push(client.storeName);
      continue;
    }

    try {
      if (isSpendOnly(client)) {
        spendOnly.push(client.storeName);
        log.info(
          `${pad(client.storeName, 28)} ${pad(
            client.attributionLabel || 'GEEN ATTRIBUTIE',
            26,
          )} spend ${padNum(metrics.spend, 10)}  revenue -> handmatig`,
        );
      } else {
        const roas = metrics.spend ? metrics.revenue / metrics.spend : 0;
        log.info(
          `${pad(client.storeName, 28)} ${pad(
            client.attributionLabel,
            26,
          )} spend ${padNum(metrics.spend, 10)}  revenue ${padNum(
            metrics.revenue,
            10,
          )}  ROAS ${roas.toFixed(2)}`,
        );
      }
      if (!DRY_RUN) {
        await writeWeek(client, start, end, metrics);
      }
      ok += 1;
    } catch (exc) {
      log.exception(`${client.storeName} gefaald bij wegschrijven`, exc);
      failed.push(client.storeName);
    }
  }

  log.info(`Klaar: ${ok} weggeschreven, ${failed.length} gefaald`);
  if (spendOnly.length) {
    log.info(`REVENUE HANDMATIG AANVULLEN: ${spendOnly.join(', ')}`);
  }
  if (notConnected.length) {
    // Normale toestand voor pas geonboarde stores. Volledig handmatig
    // invullen tot de koppeling er is; daarna pakt de sync ze vanzelf op.
    log.info(`NOG NIET GEKOPPELD, VOLLEDIG HANDMATIG: ${notConnected.join(', ')}`);
  }
  if (failed.length) {
    // Stuur dit naar je eigen Slack-kanaal, niet naar een klantkanaal.
    log.error(`HANDMATIG NALOPEN: ${failed.join(', ')}`);
  }
}

// Alleen draaien wanneer dit bestand direct wordt aangeroepen.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) {
  run().catch((e) => {
    log.exception('Sync gefaald', e);
    process.exit(1);
  });
}
