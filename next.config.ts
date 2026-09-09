import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // typedRoutes is off deliberately: most links here are built from database
  // ids (`/devices/${id}`), which the literal route union cannot express
  // without a cast at every call site — noise that hides real mistakes.
  typedRoutes: false,

  /*
   * Icon and chart imports, tree-shaken per file.
   *
   * `lucide-react` ships a thousand-odd icon modules and a barrel that
   * re-exports every one of them. A page importing four icons pulls the whole
   * barrel into its module graph without this, which is the single largest
   * avoidable cost in this app's client bundles. `recharts` and `date-fns`
   * have the same shape.
   */
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns"],
  },

  /*
   * The terminals push punches to /iclock/* over plain HTTP from the factory
   * LAN and are not browsers — but every *browser* response should carry the
   * headers below. Set here rather than in middleware so they apply to static
   * assets too, which middleware never sees.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // A payslip or an attendance register has no business in a frame on
          // somebody else's page.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Hashed by the build, so they can never go stale — a year is the
        // longest anything is worth caching and these earn it.
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
