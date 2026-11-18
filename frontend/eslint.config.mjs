import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import { defineConfig, globalIgnores } from "eslint/config"

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Allow omitting props via rest destructuring, e.g. ({ node, ...props }) in markdown overrides
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
    },
  },
  {
    // Server actions can be called from any route, so admin code must check admin access before using the API key
    files: ["src/app/admin/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/apiClient", "**/lib/apiClient"],
              message: "Use getAdminClient from @/lib/adminApiClient, which checks admin access, in admin code.",
            },
          ],
        },
      ],
    },
  },
  // public/scripts holds the bundled widget; src/generated is GraphQL codegen output
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "public/**", "src/generated/**"]),
])
