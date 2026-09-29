import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "i.pinimg.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  serverExternalPackages: ["bullmq", "ioredis", "@resvg/resvg-js", "pptxgenjs", "pdf-lib", "@pdf-lib/fontkit"],
  // The delivery-meeting cron reads its fonts and logo from disk at runtime;
  // without this they are not in the serverless bundle.
  outputFileTracingIncludes: {
    "/api/cron/delivery-meeting/[stage]": ["./src/lib/delivery-meeting/assets/**"],
  },
};

export default nextConfig;
