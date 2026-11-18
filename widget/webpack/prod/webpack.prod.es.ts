// Creates a js bundle without the React and ReactDOM dependencies
// It's expected that the hosting website will provide these dependencies
// It is bundled into the host's own scripts, so it can't tell which installation served it: the origin option or
// LUMI_WIDGET_ORIGIN says which one to connect to

import type { Configuration } from "webpack"
import { merge } from "webpack-merge"

import prodCommon from "./webpack.prod.common.ts"

const config: Configuration = {
  entry: "./src/widget.tsx",
  output: {
    filename: "lumi-widget.bundle.es.js",
    library: {
      type: "module",
    },
  },
  externalsType: "module",
  externals: {
    react: "react",
    "react/jsx-runtime": "react/jsx-runtime",
    "react-dom": "react-dom",
  },
  experiments: {
    outputModule: true, // Enables ES module output in Webpack
  },
}

if (!process.env.LUMI_WIDGET_ORIGIN?.trim()) {
  console.warn(
    "LUMI_WIDGET_ORIGIN is unset, so the ES module bundle has no Lumi installation to connect to: pages must pass the " +
      "widget's origin prop. Build with LUMI_WIDGET_ORIGIN=https://lumi.example.com to set a default."
  )
}

export default merge(prodCommon({ useScriptOrigin: false }), config)
