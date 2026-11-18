import path from "path"
import type { Configuration as WebpackConfiguration } from "webpack"
import type { Configuration as WebpackDevServerConfiguration } from "webpack-dev-server"
import { merge } from "webpack-merge"

import common from "./webpack.common.ts"

interface Configuration extends WebpackConfiguration {
  devServer?: WebpackDevServerConfiguration
}

const config: Configuration = {
  output: {
    library: "LumiWidget",
    libraryTarget: "umd",
    umdNamedDefine: true,
  },
  devtool: "inline-source-map",
  devServer: {
    allowedHosts: "all",
    static: {
      directory: path.join(import.meta.dirname, "..", "test"),
    },
    port: 2000,
    open: false,
    // Applies the HotModuleReplacementPlugin itself
    hot: true,
  },
}

export default merge(common("development"), config)
