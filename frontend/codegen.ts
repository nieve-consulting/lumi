import path from "node:path"
import type { CodegenConfig } from "@graphql-codegen/cli"

const backend = path.resolve(__dirname, "../backend")
// Read by tsx when it registers, so the backend's `@/` imports resolve against the backend rather than this workspace.
process.env.TSX_TSCONFIG_PATH = path.join(backend, "tsconfig.json")

const config: CodegenConfig = {
  overwrite: true,
  // The backend's SDL module rather than a running server, so codegen needs no backend `.env`, database or port. The
  // `codegen` script runs the CommonJS build of the CLI, whose loader goes through `require` and so through tsx.
  require: [require.resolve("tsx/cjs", { paths: [backend] })],
  schema: path.join(backend, "src/apollo/schema/type-defs.ts"),
  generates: {
    "src/generated/graphql.ts": {
      plugins: ["typescript"],
    },
  },
}

export default config
