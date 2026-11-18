// Replaced at build time by webpack's `mode` (DefinePlugin)
declare const process: {
  env: {
    NODE_ENV: "development" | "production"
  }
}

// Replaced at build time (DefinePlugin, see webpack/webpack.common.ts): the normalized LUMI_WIDGET_ORIGIN the widget was
// built with, if any, and whether this bundle may fall back to the origin of the script that loaded it
declare const __LUMI_WIDGET_ORIGIN__: string | undefined
declare const __LUMI_WIDGET_SCRIPT_ORIGIN__: boolean
