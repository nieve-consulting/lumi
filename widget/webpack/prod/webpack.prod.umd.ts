// Creates a js bundle with all the dependencies
// Pages load it with a <script> tag, so without an origin option or LUMI_WIDGET_ORIGIN it connects to the installation it was
// loaded from, such as the web app that serves it at /scripts/lumi-widget.bundle.umd.js

import type { Configuration } from "webpack"
import { merge } from "webpack-merge"

import prodCommon from "./webpack.prod.common.ts"

const config: Configuration = {
  output: {
    filename: "lumi-widget.bundle.umd.js",
    library: "LumiWidget",
    libraryTarget: "umd",
    umdNamedDefine: true,
  },
}

export default merge(prodCommon({ useScriptOrigin: true }), config)
