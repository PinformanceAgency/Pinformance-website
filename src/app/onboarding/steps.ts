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
    title: "Welcome to Pinformance",
    short: "Welcome",
    desc: "Watch the intro from Tristan so you know your team and what's coming next.",
  },
  {
    id: "intake",
    number: 2,
    title: "Intake questionnaire",
    short: "Intake",
    desc: "Fill out the intake — this is what we need to set up your account properly.",
  },
  {
    id: "pinterest",
    number: 3,
    title: "Pinterest setup",
    short: "Pinterest",
    desc: "Set up your Pinterest Business account, grant us access, and connect your tracking.",
  },
  {
    id: "admin",
    number: 4,
    title: "Contracts & billing",
    short: "Admin",
    desc: "Two quick videos so you know what's coming: how our contracts work and how billing is handled.",
  },
  {
    id: "kickoff",
    number: 5,
    title: "Book your kickoff call",
    short: "Kickoff",
    desc: "Pick a slot for the kickoff — we go live as fast as possible after that (ideally within 24 hours).",
  },
  {
    id: "done",
    number: 6,
    title: "You're on board",
    short: "Done",
    desc: "Everything is set. Here's what happens next.",
  },
];

export const STEP_IDS = STEPS.map((s) => s.id);
