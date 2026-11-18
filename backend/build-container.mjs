import fs from "fs"
import { build } from "esbuild"

// The container image's bundle (backend/Dockerfile): every command of src/container/main.ts in one self-contained CommonJS
// file, run as `node dist/container/lumi.cjs <command>`. Unlike the Lambdas' bundles it includes the AWS SDK, which only the
// Lambda runtime provides. The bundled migrations are read from db/migrations next to it (src/container/health.ts).
// - mainFields prefers a dependency's ES module build, which tree-shakes better, as the Lambda bundles should (README.md)
// - pg-native is pg's optional native binding, never used; @sparticuz/chromium is the PDF Lambda's Chromium, never imported here
const result = await build({
  entryPoints: ["src/container/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: ["node24"],
  mainFields: ["module", "main"],
  outfile: "dist/container/lumi.cjs",
  external: ["pg-native", "@sparticuz/chromium"],
  minify: true,
  keepNames: true,
  sourcemap: true,
  metafile: true,
  treeShaking: true,
  logLevel: "warning",
})

fs.writeFileSync("dist/container/meta.json", JSON.stringify(result.metafile))
