import pluginJs from "@eslint/js"
import pluginReact from "eslint-plugin-react"
import reactHooks from "eslint-plugin-react-hooks"
import { defineConfig, globalIgnores } from "eslint/config"
import globals from "globals"
import tseslint from "typescript-eslint"

export default defineConfig([
  globalIgnores(["dist/", "test/"]),
  { languageOptions: { globals: globals.browser } },
  { files: ["webpack/**"], languageOptions: { globals: globals.node } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  reactHooks.configs.flat.recommended,
  {
    settings: { react: { version: "detect" } },
    rules: { "react/prop-types": "off" },
  },
])
