// A Google service account's JSON key, base64-encoded as GOOGLE_SERVICE_ACCOUNT_CREDENTIALS and GOOGLE_DIRECTORY_CREDENTIALS
// hold it. Undefined when unset or not such a key; the parse error is never surfaced, as its message can quote part of the key
export function decodeServiceAccountKey(value: string | undefined): { clientEmail: string; privateKey: string } | undefined {
  if (!value?.trim()) return undefined

  try {
    const { client_email, private_key } = JSON.parse(Buffer.from(value.trim(), "base64").toString("utf8"))
    if (typeof client_email === "string" && typeof private_key === "string") {
      return { clientEmail: client_email, privateKey: private_key }
    }
  } catch {
    // Not base64-encoded JSON
  }
  return undefined
}
