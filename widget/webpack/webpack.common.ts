import ESLintPlugin from "eslint-webpack-plugin"
import webpack from "webpack"
import type { Configuration } from "webpack"

import { parseOrigin } from "../src/origin.ts"

interface Options {
  // Whether the bundle may connect to the origin of the script that loaded it: only the production UMD bundle, which a page
  // loads with a <script> tag from the installation that serves it
  useScriptOrigin?: boolean
}

// The Lumi installation the bundle connects to when the page doesn't say, from LUMI_WIDGET_ORIGIN. An unset or empty variable
// leaves the bundle without one; anything else must be a valid origin, or the build stops with only the reason, as
// webpack-cli would bury a thrown error under its attempts to load the config another way
function buildOrigin(): string | undefined {
  const value = process.env.LUMI_WIDGET_ORIGIN
  if (!value?.trim()) return undefined

  const parsed = parseOrigin(value)
  if ("origin" in parsed) return parsed.origin

  console.error(
    `LUMI_WIDGET_ORIGIN ${JSON.stringify(value)} isn't valid: ${parsed.error}. ` +
      "Set it to the origin of the Lumi installation the widget connects to, such as https://lumi.example.com, " +
      "with no path, query or credentials, or unset it."
  )
  process.exit(1)
}

const LICENSE_BANNER =
  "Lumi widget | Copyright Nieve Consulting Services S.L. | SPDX-License-Identifier: Apache-2.0 | " +
  "https://github.com/nieve-consulting/lumi/blob/main/widget/LICENSE"

// Babel 8 picks the JSX runtime from its env (BABEL_ENV/NODE_ENV, "development" by default), not from webpack's mode,
// so the mode is passed as envName: otherwise production builds call jsxDEV, which React's production runtime leaves undefined
const common = (mode: "development" | "production", { useScriptOrigin = false }: Options = {}): Configuration => {
  const origin = buildOrigin()

  return {
    mode,
    entry: "./src/index.tsx",
    module: {
      rules: [
        {
          test: /\.(ts|js)x?$/i,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader",
            options: {
              envName: mode,
              presets: ["@babel/preset-env", "@babel/preset-react", "@babel/preset-typescript"],
            },
          },
        },
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
    },
    plugins: [
      new ESLintPlugin({
        extensions: ["js", "jsx", "ts", "tsx"],
      }),
      // See src/env.d.ts
      new webpack.DefinePlugin({
        __LUMI_WIDGET_ORIGIN__: origin === undefined ? "undefined" : JSON.stringify(origin),
        __LUMI_WIDGET_SCRIPT_ORIGIN__: JSON.stringify(useScriptOrigin),
      }),
      // The bundles run on and are bundled into other websites, so each says its own license and copyright. Added after
      // minification, which would otherwise move the comment into the dependencies' extracted .LICENSE.txt
      new webpack.BannerPlugin({
        banner: LICENSE_BANNER,
        entryOnly: true,
        stage: webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT,
      }),
    ],
  }
}

export default common
