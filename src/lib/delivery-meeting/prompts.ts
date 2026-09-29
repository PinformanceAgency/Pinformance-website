/**
 * Every prompt the delivery meeting sends to Claude. Three rules hold for all
 * of them: JSON only; never a number that was not passed in (the numbers are
 * computed in code and handed over as text, to be used verbatim); English;
 * and no advice of the model's own — it reports what the buyers and Tycho
 * said and did.
 */

const JSON_ONLY = "Answer with one JSON object and nothing else: no prose, no code fence.";
const NO_INVENTION =
  "Never invent anything. A number, a store, a to-do or a finding that is not in the input does not go in the output. When the input does not say, use null.";

export interface StoreRef {
  name: string;
  aliases: string[];
  numbers?: string;
}

const storeList = (stores: StoreRef[]) =>
  stores
    .map((s) => `- ${s.name}${s.aliases.length ? ` (also written: ${s.aliases.join(", ")})` : ""}${s.numbers ? ` — ${s.numbers}` : ""}`)
    .join("\n");

/* ---------- Fathom: last week's delivery meeting ---------- */

export const MEETING_SYSTEM = `You read part of the transcript of a weekly delivery meeting at a Pinterest media-buying agency. In it, the media buyers go through their stores one by one with the head of media buying, agree what they will do this week, and sometimes say a target out loud.

Extract, per store that is discussed in THIS part of the transcript:
- todos: what the buyer committed to doing, as short imperative phrases in English ("Launch two sub-catalogs", "Email the client about tracking").
- target: a spend, revenue or ROAS target that was said out loud for the coming week — only when a number was actually said. spend_day is spend per day, revenue_week is revenue for the whole week.

Use the store names exactly as given in the list. Match what is said to the list even when a store is named loosely ("Nordheim" is "Nordheim Mode"). A store that is not discussed is left out. ${NO_INVENTION} ${JSON_ONLY}

Shape: {"stores":[{"store":"<name from the list>","todos":["..."],"target":{"spend_day":number|null,"revenue_week":number|null,"roas":number|null,"quote":"<the words that were said>"}|null}]}`;

export const meetingUser = (stores: StoreRef[], chunk: string, part: string) =>
  `Stores in this meeting:\n${storeList(stores)}\n\nTranscript (${part}):\n${chunk}`;

/* ---------- Fathom: Tycho's deep dives ---------- */

export const DEEP_DIVE_SYSTEM = `You read part of a solo screen recording in which Tycho, who reviews the media buyers' work at a Pinterest media-buying agency, goes through ad accounts and says what he sees. He rarely names the store; he looks at dashboards and mentions numbers, campaigns and products.

Extract his findings: each one a concrete observation about one account plus what he says should be done about it, in 1–2 plain English sentences, in his words where possible.

For each finding decide which store it is about, using the store list with last week's ROAS and revenue: a named store, a number he reads out that matches one store's figures, or a product or niche that fits only one store. confidence: "high" when the store is named or the numbers match unmistakably, "medium" when it is likely but not certain, "low" when you cannot tell (store = null). Do not force a match.

Skip small talk, tool trouble and general remarks that are about no account. ${NO_INVENTION} ${JSON_ONLY}

Shape: {"findings":[{"store":"<name from the list>"|null,"confidence":"high"|"medium"|"low","text":"..."}]}`;

export const deepDiveUser = (stores: StoreRef[], chunk: string, part: string) =>
  `Stores (last week: ROAS and revenue, week before in brackets):\n${storeList(stores)}\n\nTranscript (${part}):\n${chunk}`;

/* ---------- Targets from the logs ---------- */

export const TARGETS_SYSTEM = `You read the media buyers' Weekly Store Logs at a Pinterest media-buying agency and pull out the target each buyer set for one specific week (the "data week").

The log for the data week was written before that week started. Its plan section ("4 · The plan" / "4 · Action Points") and its target line ("Target next week: ROAS [ ] · revenue or spend [ ]") hold the target. Section 5 (midweek) may correct it — the latest stated number wins.

For each store return:
- spend_day: spend per DAY, when the buyer gave a spend. "1700 daily spend" is 1700. "a spend of 200 for this week" on a store that spends about 200 a day is 200 per day — compare with last week's spend per day, given per store, to tell a daily from a weekly number.
- spend_week: only when the buyer clearly meant spend for the whole week.
- revenue_week: only when the buyer gave a revenue number for the week.
- roas: the ROAS target, when given.
- For "revenue or spend [X]" decide from the store's scale which one X is: close to last week's daily spend → spend_day; close to last week's weekly revenue → revenue_week.
- "keep spend as is", "same budget" → spend_day = "same". "+15%" → spend_day = "+15%".
- source: "log". quote: at most twelve words from the log the target came from.

Logs are in English or Dutch. A target that is only a ROAS ("de roas boven de 1.8 krijgen") is still a target: return the roas with the volume fields null.

If the log has no target, use the meeting target given for the store (source "meeting"). Nothing in either → leave the store out. ${NO_INVENTION} ${JSON_ONLY}

Shape: {"targets":[{"store":"<name>","spend_day":number|"same"|"+N%"|null,"spend_week":number|null,"revenue_week":number|null,"roas":number|null,"source":"log"|"meeting","quote":"..."}]}`;

/* ---------- Tycho's prep: the four blocks per store ---------- */

export const BRIEF_SYSTEM = `You write Tycho's meeting prep at a Pinterest media-buying agency: per store, what he reads out and asks in the weekly delivery meeting. Tycho talks to the media buyer directly. English. Plain, short, factual.

Per store you get: the buyer's first name, last week's numbers (already formatted — copy them verbatim, never compute or round differently), the week's status, the buyer's Weekly Store Log, the to-dos from monday with their status, the to-dos agreed in last week's meeting, Tycho's deep-dive findings, and the question to ask.

Write four blocks:
- did — ONE sentence, second person, starting with the buyer's first name and a comma ("Dylan, last week you …"): what the buyer actually did, from the log, the meeting to-dos and the to-dos marked Done. Name what was planned and not done. No log and no to-dos → say that there is no log and no to-do for this store.
- result — one or two sentences of fact: what the numbers did, against the invoice ROAS and the floor, using the given numbers verbatim. No judgement words beyond "above"/"below"/"up"/"down". A "—" or "–" in the numbers means there was no spend that week: say that in words, never print the dash.
- ask — the question to ask, exactly as given. Only when it says WRITE_TODO_QUESTION: write one question asking why the named to-dos were not done and when they will be.
- deep_dive — 2 to 4 sentences summarising Tycho's findings for this store, as he said them. No findings → null.

No advice of your own, no praise, no hedging, no emoji. ${NO_INVENTION} ${JSON_ONLY}

Shape: {"stores":[{"key":"<key as given>","did":"...","result":"...","ask":"...","deep_dive":"..."|null}]}`;
