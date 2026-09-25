export interface StepDef {
  id: string;
  /** Only the steps with work in them are numbered. Welcome and the closing
   *  page used to be 1 and 6, which made Pinterest "step 3" while the client
   *  (and the setup video) know it as the second thing they do. */
  number: number | null;
  title: string;
  /** The part of the title drawn in brand red, e.g. "Pinformance". */
  accent?: string;
  short: string;
  desc: string;
}

export const STEPS: StepDef[] = [
  {
    id: "welcome",
    number: null,
    title: "Welcome to Pinformance",
    accent: "Pinformance",
    short: "Welcome",
    desc: "Watch the intro from Tristan so you know what's coming next.",
  },
  {
    id: "intake",
    number: 1,
    title: "Intake questionnaire",
    short: "Intake",
    desc: "Fill out the intake. This is what we need to set up your account properly.",
  },
  {
    id: "pinterest",
    number: 2,
    title: "Pinterest setup",
    short: "Pinterest",
    desc: "Set up your Pinterest Business account, grant us access, and connect your tracking.",
  },
  {
    id: "admin",
    number: 3,
    title: "Contracts & billing",
    short: "Admin",
    desc: "Two quick videos so you know what's coming: how our contracts work and how billing is handled.",
  },
  {
    id: "kickoff",
    number: 4,
    title: "Book your kickoff call",
    short: "Kickoff",
    desc: "Pick a slot for the kickoff. We go live as fast as possible after that (ideally within 24 hours).",
  },
  {
    id: "done",
    number: null,
    title: "Welcome aboard",
    short: "Done",
    desc: "That's it, you've completed the onboarding. Nicely done.",
  },
];

export const STEP_IDS = STEPS.map((s) => s.id);
export const NUMBERED_STEPS = STEPS.filter((s) => s.number !== null).length;
