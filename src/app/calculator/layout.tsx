import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pinformance Calculator — Pinterest Performance Advertising",
  description: "Pinformance cost and projected revenue for your brand.",
};

export default function CalculatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
