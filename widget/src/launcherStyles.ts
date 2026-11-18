// The launcher is a native button on the host page, reset after the host's stylesheets. With a className, the reset has the
// specificity of a bare `button` rule, so it overrides host `button` rules while the host's class still wins. Without one
// (lumi-launcher-default), it also overrides state rules such as `button:hover`. The focus ring is important so host resets
// such as `*:focus { outline: none }` can't hide it. The chat's loading placeholder pulses, as inline styles can't animate,
// and holds still for visitors who prefer reduced motion
const launcherStyles = `
button:where(.lumi-launcher), button.lumi-launcher-default {
  background: transparent; color: inherit; font: inherit; text-transform: inherit; letter-spacing: inherit;
}
.lumi-launcher:focus-visible { outline: 3px solid #2563eb !important; outline-offset: 3px !important; }
@keyframes lumi-skeleton-pulse { 50% { opacity: 0.5; } }
.lumi-skeleton-bone { animation: lumi-skeleton-pulse 1.5s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .lumi-skeleton-bone { animation: none; } }
`

let applied = false

// Adds the launcher styles to the host page once. A constructed stylesheet isn't subject to the host's CSP, which can block
// <style> elements; browsers without constructed stylesheets get a <style> element instead
export function applyLauncherStyles() {
  if (applied) return
  applied = true

  if ("adoptedStyleSheets" in Document.prototype && "replaceSync" in CSSStyleSheet.prototype) {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(launcherStyles)
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
  } else {
    const style = document.createElement("style")
    style.textContent = launcherStyles
    document.head.append(style)
  }
}
