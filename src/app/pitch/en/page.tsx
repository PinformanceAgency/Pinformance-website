import type { Metadata } from "next";

import PitchCanvas from "../PitchCanvas";

export const metadata: Metadata = {
  title: "Pinformance, sales presentation",
  description:
    "Pinterest, and nothing else. The channel, who we are, how we work, the numbers, the pricing and the guarantees.",
};

export default function PitchPageEn() {
  return <PitchCanvas lang="en" />;
}
