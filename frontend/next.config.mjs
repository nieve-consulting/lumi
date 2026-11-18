import { fileURLToPath } from "node:url"

// The container image (Dockerfile) sets NEXT_OUTPUT=standalone: a self-contained server.js with only the files it needs, traced
// from the repository root so the workspace packages are included. Vercel builds use their own output
const standalone = process.env.NEXT_OUTPUT === "standalone"

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(standalone && { output: "standalone", outputFileTracingRoot: fileURLToPath(new URL("..", import.meta.url)) }),
  // Shared contracts ship TypeScript source
  transpilePackages: ["@lumi/shared-contracts"],
  images: {
    unoptimized: true,
  },
  // Do not generate AGENTS.md and CLAUDE.md in frontend/ when `next dev` detects an AI coding agent
  agentRules: false,
  //reactStrictMode: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // No other site may frame the app, e.g. to trick an admin into clicking in /admin or /setup, except the /widget page
      // that the embeddable launcher shows in its iframe on the business's websites (its language routes too)
      {
        source: "/:path((?!widget(?:/|$)).*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ]
  },
  // Admin pages from before consultants and skills became team members and capabilities, so bookmarks keep working
  async redirects() {
    return [
      { source: "/admin/consultants/:path*", destination: "/admin/team-members/:path*", permanent: true },
      { source: "/admin/skills", destination: "/admin/capabilities", permanent: true },
    ]
  },
}

export default nextConfig
