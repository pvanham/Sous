import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    // Universal Link / App Link association files must be served with
    // `Content-Type: application/json` for both iOS and Android
    // validators to accept them. The iOS file deliberately has no
    // extension (per Apple's spec), which means Next.js's default
    // static-file Content-Type detection treats it as
    // `application/octet-stream` — these headers correct that for
    // both files.
    return [
      {
        source: "/.well-known/apple-app-site-association",
        headers: [
          { key: "Content-Type", value: "application/json" },
        ],
      },
      {
        source: "/.well-known/assetlinks.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
        ],
      },
    ];
  },
};

export default nextConfig;
