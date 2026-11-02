import type { NextConfig } from "next";

// The static ffmpeg binary (bundled via @ffmpeg-installer/ffmpeg) extracts
// video poster frames — needed on Vercel serverless where no system ffmpeg
// exists. It must ship inside the traced serverless bundles of every route
// that can trigger poster extraction.
const FFMPEG_TRACE = ["./node_modules/@ffmpeg-installer/**"];

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
  outputFileTracingIncludes: {
    "/api/video": FFMPEG_TRACE,
    "/api/video/[jobId]": FFMPEG_TRACE,
    "/api/video-poster/[id]": FFMPEG_TRACE,
    "/api/mcp": FFMPEG_TRACE,
  },
};

export default nextConfig;
