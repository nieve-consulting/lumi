import path from "path"
import { CleanWebpackPlugin } from "clean-webpack-plugin"
import type { Configuration } from "webpack"
import { merge } from "webpack-merge"

import common from "../webpack.common.ts"

const config: Configuration = {
  output: {
    path: path.resolve(import.meta.dirname, "..", "..", "dist"),
  },
  plugins: [new CleanWebpackPlugin()],
}

const prodCommon = (options: Parameters<typeof common>[1]) => merge(common("production", options), config)

export default prodCommon
