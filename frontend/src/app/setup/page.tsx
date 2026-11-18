import type { Metadata } from "next"
import Image from "next/image"
import { redirect } from "next/navigation"
import { connection } from "next/server"

import { hasAdminAccounts } from "@/lib/auth/localAccounts"
import { authMode } from "@/lib/auth/mode"
import { fetchPublicBusiness, hasStaleBusiness } from "@/lib/business"
import { setupGate } from "@/lib/setupToken"

import SetupFlow from "./SetupFlow"

export const metadata: Metadata = {
  title: "Set up Lumi",
  // The wizard only shows until the installation is set up
  robots: { index: false },
}

// The onboarding wizard, open until the business is set up, to anyone or to whoever has the installation's setup token
// (see lib/setupToken.ts; always required in local sign-in mode, where the wizard also creates the first admin unless one
// exists); admins then edit the settings in the admin. Rendered per request, as it depends on whether the settings exist and
// on the visitor's access
export default async function SetupPage() {
  await connection()
  let configured: boolean | undefined
  try {
    // Uncached, so a stale cache can't send the visitor away while the proxy sends them here
    configured = (await fetchPublicBusiness()) !== null
  } catch (error) {
    // The wizard still shows: saving tells whether the installation was already set up
    console.error("Couldn't check whether the business is set up", error)
  }
  if (configured) redirect("/")
  const staleCache = configured === false && (await hasStaleBusiness())
  const gate = await setupGate()
  const local = authMode() === "local"
  // When the API can't say, the step shows: finishing tells whether an admin already exists
  const askAdmin = local && !(await hasAdminAccounts().catch(() => false))

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <header className="mx-auto mb-6 flex max-w-3xl items-center gap-3">
        <Image src="/images/lumi-pebble.webp" alt="" width={64} height={64} className="size-12" />
        <div>
          <h1 className="text-2xl font-bold">Set up Lumi</h1>
          <p className="text-sm text-slate-600">
            {gate === "open"
              ? "Anyone who opens this page can complete it, and it can only be completed once. Finish it before you share this address."
              : gate === "missing"
                ? "It can only be completed with a setup token, which this installation doesn't have yet."
                : "Only someone with this installation's setup token can complete it, and only once."}{" "}
            {askAdmin && gate !== "missing" && "It also creates the first admin account. "}
            Signed-in admins can change everything later in the admin&apos;s Settings.
          </p>
        </div>
      </header>
      {configured === undefined && (
        <p role="status" className="mx-auto mb-4 max-w-3xl rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Lumi&apos;s server isn&apos;t answering right now. You can fill in the steps, but finishing needs it to be back.
        </p>
      )}
      <main>
        <SetupFlow gate={gate} expireStaleCache={staleCache} askAdmin={askAdmin} local={local} />
      </main>
    </div>
  )
}
