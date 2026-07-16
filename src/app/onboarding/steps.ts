export interface StepDef {
  id: string;
  number: number;
  title: string;
  short: string;
  desc: string;
}

export const STEPS: StepDef[] = [
  {
    id: "welcome",
    number: 1,
    title: "Welkom bij Pinformance",
    short: "Welkom",
    desc: "Bekijk de intro van Tristan zodat je weet wie je team is en wat je te wachten staat.",
  },
  {
    id: "intake",
    number: 2,
    title: "Intake vragenlijst",
    short: "Intake",
    desc: "Vul de intake in — deze data hebben we nodig om je account goed op te bouwen.",
  },
  {
    id: "pinterest",
    number: 3,
    title: "Pinterest setup",
    short: "Pinterest",
    desc: "Zet je Pinterest Business account op, geef ons toegang en verbind je tracking.",
  },
  {
    id: "admin",
    number: 4,
    title: "Administratie & contract",
    short: "Administratie",
    desc: "Lees het contract door en teken via DocuSign. Korte uitleg over de facturering.",
  },
  {
    id: "kickoff",
    number: 5,
    title: "Kickoff call inplannen",
    short: "Kickoff",
    desc: "Plan je kickoff call in — hierna gaan we zo snel mogelijk live (idealiter binnen 24 uur).",
  },
  {
    id: "done",
    number: 6,
    title: "Klaar — welkom aan boord",
    short: "Klaar",
    desc: "Alles staat. Wat er nu gaat gebeuren.",
  },
];

export const STEP_IDS = STEPS.map((s) => s.id);
