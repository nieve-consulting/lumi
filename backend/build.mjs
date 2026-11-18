import fs from "fs"
import { build } from "esbuild"

const result = await build({
  entryPoints: ["src/apollo/local/apollo.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  sourcemap: true,
  metafile: true,
  target: ["node22"],
  outfile: "dist/bundle.js",
  treeShaking: true,
})

fs.writeFileSync("dist/meta.json", JSON.stringify(result.metafile))
