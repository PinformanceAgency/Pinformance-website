import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pinformance — Pinterest Automation for E-commerce",
  description: "AI-powered Pinterest content creation and posting automation for e-commerce brands",
  // Icons are not declared here on purpose. src/app/favicon.ico,
  // icon.png and apple-icon.png are Next.js file conventions and are
  // emitted automatically with content hashes; an explicit `icons` block
  // overrides them and would pin us back to the .ico alone.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
