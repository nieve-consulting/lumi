import { escapeHtml, html } from "../http"

const STYLE = `
  :root { color-scheme: light dark; --bg: #f6f7f9; --card: #fff; --text: #111827; --muted: #4b5563; --border: #e5e7eb; --input-border: #6b7280; --accent: #0f766e; --on-accent: #fff; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0b0f14; --card: #111827; --text: #f3f4f6; --muted: #9ca3af; --border: #1f2937; --accent: #2dd4bf; --on-accent: #042f2e; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; }
  main { width: 100%; max-width: 440px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 28px; overflow-wrap: anywhere; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  p, li { color: var(--muted); }
  ul { padding-left: 20px; }
  strong { color: var(--text); }
  .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
  button { flex: 1; min-width: 9rem; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--input-border); background: transparent; color: var(--text); font: inherit; cursor: pointer; }
  button.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  a { color: var(--accent); }
  label { display: block; margin-top: 16px; font-weight: 600; color: var(--text); }
  input { display: block; width: 100%; margin-top: 6px; padding: 9px 12px; border-radius: 8px; border: 1px solid var(--input-border); background: transparent; color: var(--text); font: inherit; font-size: 16px; }
  input[aria-invalid="true"] { border-color: #dc2626; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .note { margin: 20px 0 0; font-size: 14px; }
  .error { margin: 16px 0 0; padding: 10px 12px; border-radius: 8px; border: 1px solid #dc2626; color: var(--text); }
`

function page(title: string, body: string, hasError = false) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${hasError ? "Error: " : ""}${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`
}

export function errorPage(message: string, status = 400) {
  return html(page("Lumi sign-in", `<h1>Lumi could not continue</h1><p>${escapeHtml(message)}</p>`, true), status)
}

export interface ConsentDetails {
  clientName: string | null
  verifiedHost: string | null
  redirectHost: string
  scopes: string[]
  requestToken: string
}

// Local sign-in: the email to show again after a failed attempt (never the password), and why it failed. The error is plain
// text, with an optional link right after it, which then gets the focus. `fields` marks the email and password as invalid,
// only when they are what's wrong
export interface SignInState {
  email?: string
  error?: { message: string; fields?: boolean; link?: { href: string; text: string } }
}

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  "lumi:read": "Find and read Lumi records, including unpublished ones",
  "lumi:write": "Create, update, publish and unpublish Lumi records and their relationships",
}

function consentIntro(details: ConsentDetails) {
  const name = details.clientName ? escapeHtml(details.clientName) : "An application"
  const identity = details.verifiedHost ? `published by <strong>${escapeHtml(details.verifiedHost)}</strong>` : `<strong>(name not verified)</strong>`
  const scopes = details.scopes.map((scope) => `<li>${escapeHtml(SCOPE_DESCRIPTIONS[scope] ?? scope)}</li>`).join("")

  return {
    name,
    intro: `<h1>Connect ${name} to Lumi</h1>
       <p><strong>${name}</strong>, ${identity}, wants to access Lumi on your behalf. It will be able to:</p>
       <ul>${scopes}</ul>`,
  }
}

// Local sign-in: the consent page asks for the admin's Lumi email and password, which approve the connection in one step. After
// a failed attempt it is shown again with the error and the email kept. The focus goes to the error's link when it has one,
// else to the password for another try
export function localConsentPage(details: ConsentDetails, state: SignInState = {}, status = 200, cookies: string[] = []) {
  const { intro } = consentIntro(details)
  const { error } = state
  const link = error?.link
  const errorHtml = error
    ? `<p id="signin-error" class="error" role="alert">${escapeHtml(error.message)}${
        link ? ` <a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer" autofocus>${escapeHtml(link.text)}</a>` : ""
      }</p>`
    : ""
  const described = error ? ` aria-describedby="signin-error"${error.fields ? ` aria-invalid="true"` : ""}` : ""

  return html(
    page(
      "Connect to Lumi",
      `${intro}
       <p>Sign in with your Lumi admin email and password to connect. You'll then return to <strong>${escapeHtml(details.redirectHost)}</strong>. Only continue if you started this connection.</p>
       <form method="post" action="/oauth/authorize">
         <input type="hidden" name="request" value="${escapeHtml(details.requestToken)}">
         ${errorHtml}
         <label for="email">Email</label>
         <input id="email" name="email" type="email" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="320" value="${escapeHtml(state.email ?? "")}"${described}${error ? "" : " autofocus"}>
         <label for="password">Password</label>
         <input id="password" name="password" type="password" autocomplete="current-password" required maxlength="1024"${described}${error && !link ? " autofocus" : ""}>
         <div class="actions">
           <button type="submit" name="decision" value="approve" class="primary">Sign in and connect</button>
           <button type="submit" name="decision" value="deny" formnovalidate>Cancel</button>
         </div>
       </form>
       <p class="note">Forgot your password? Ask another Lumi admin to add you again, or the person who runs Lumi to reset it.</p>`,
      Boolean(error)
    ),
    status,
    cookies
  )
}

// Shown before signing in with Google, so a client can never obtain access without the user seeing who asks for it
export function consentPage(details: ConsentDetails, cookies: string[]) {
  const { intro } = consentIntro(details)

  return html(
    page(
      "Connect to Lumi",
      `${intro}
       <p>You will sign in with your team's Google Workspace account, then return to <strong>${escapeHtml(details.redirectHost)}</strong>. Only continue if you started this connection.</p>
       <form method="post" action="/oauth/authorize">
         <input type="hidden" name="request" value="${escapeHtml(details.requestToken)}">
         <div class="actions">
           <button type="submit" name="decision" value="deny">Cancel</button>
           <button type="submit" name="decision" value="approve" class="primary">Continue with Google</button>
         </div>
       </form>`
    ),
    200,
    cookies
  )
}
