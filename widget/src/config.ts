import { parseOrigin } from "./origin"

const EXAMPLE_ORIGIN = "https://lumi.example.com"
// The web app in development, through the local proxy that also serves /agents (https://docs.lumi.nieve.ai/getting-started)
const DEVELOPMENT_ORIGIN = "http://localhost:8080"

// The origin of the script that loaded the bundle, only read in the production UMD bundle: a page loads it with a <script>
// tag from the installation that serves it. document.currentScript is only set while that script runs, so it's captured as
// the module is evaluated. The ES module bundle is bundled into the host's own scripts, whose origin says nothing about Lumi
const scriptOrigin = (() => {
  if (!__LUMI_WIDGET_SCRIPT_ORIGIN__ || typeof document === "undefined") return undefined
  const script = document.currentScript
  if (!(script instanceof HTMLScriptElement) || !script.src) return undefined
  const parsed = parseOrigin(new URL(script.src).origin)
  return "origin" in parsed ? parsed.origin : undefined
})()

export type ResolvedOrigin = { origin: string } | { error: string }

// The Lumi installation the widget connects to: the origin option, else the LUMI_WIDGET_ORIGIN it was built with (checked
// by the build), else in the production UMD bundle the origin of its script, else the local web app in development. A
// build that names its installation keeps it wherever the bundle is copied to, e.g. a CDN or the host's own static files.
// An invalid origin option is an error rather than a reason to try the next, so the widget never quietly connects somewhere
// it wasn't told to
export function resolveLumiOrigin(option: unknown): ResolvedOrigin {
  if (option !== undefined && option !== null) {
    const parsed = parseOrigin(option)
    if ("origin" in parsed) return parsed
    return {
      error:
        `Lumi widget: the origin option ${JSON.stringify(option)} isn't valid: ${parsed.error}. ` +
        `Pass the origin of your Lumi installation, such as origin: "${EXAMPLE_ORIGIN}".`,
    }
  }

  if (__LUMI_WIDGET_ORIGIN__) return { origin: __LUMI_WIDGET_ORIGIN__ }
  if (scriptOrigin) return { origin: scriptOrigin }
  if (process.env.NODE_ENV !== "production") return { origin: DEVELOPMENT_ORIGIN }

  return {
    error:
      "Lumi widget: it doesn't know which Lumi installation to connect to, so it isn't shown. " +
      `Pass its origin, as in LumiWidget.init({ selector, origin: "${EXAMPLE_ORIGIN}" }) or the widget's origin prop, ` +
      (__LUMI_WIDGET_SCRIPT_ORIGIN__ ? "load this bundle from the installation's /scripts/lumi-widget.bundle.umd.js, " : "") +
      "or build the widget with LUMI_WIDGET_ORIGIN set to that origin.",
  }
}
