import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen is per-user, request-time data (session cookie + live order
  // status), so we opt out of Cache Components and let pages render dynamically.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
