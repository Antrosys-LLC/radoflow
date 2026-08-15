import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // typedRoutes is off deliberately: most links here are built from database
  // ids (`/devices/${id}`), which the literal route union cannot express
  // without a cast at every call site — noise that hides real mistakes.
  typedRoutes: false,
};

export default nextConfig;
