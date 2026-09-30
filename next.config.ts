import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "i.pinimg.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  serverExternalPackages: ["bullmq", "ioredis", "@resvg/resvg-js", "pptxgenjs"],
  // The delivery-meeting cron reads the deck logo from disk at runtime;
  // without this it is not in the serverless bundle.
  outputFileTracingIncludes: {
    "/api/cron/delivery-meeting/[stream]/[stage]": ["./src/lib/delivery-meeting/assets/**"],
  },
};

export default nextConfig;
