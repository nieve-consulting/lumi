// The PEM certificates of a certificate authority file, base64-encoded on one line as DB_SSL_CA holds them (`base64 -w0
// ca.pem`). Undefined when unset or not such a file
export function decodeCaCertificates(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined

  const pem = Buffer.from(value.trim(), "base64").toString("utf8")
  return /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/.test(pem) ? pem : undefined
}
