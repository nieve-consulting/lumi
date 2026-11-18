import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto"

// Password hashing for the admin accounts (src/services/adminAccounts.ts), with Node's scrypt. A hash is stored as
// scrypt$<N>$<r>$<p>$<salt>$<key>, salt and key in base64url, so the parameters can be raised later: older hashes keep
// verifying with their own and are rehashed on the next sign-in (needsRehash). Never log a password or a hash

// 32 MiB of memory per hash (128 * N * r bytes): affordable on the 256 MB Apollo Lambda
const PARAMETERS = { N: 2 ** 15, r: 8, p: 1 }
const SALT_BYTES = 16
const KEY_BYTES = 64

// Bounds on the parameters read from a stored hash, so a corrupt one can't make a check take more memory than the Lambda
// can spare (twice today's) or much more time
const MAX_MEMORY_BYTES = 64 * 1024 * 1024
const MAX_PARALLELIZATION = 4

type Parameters = typeof PARAMETERS

// The memory scrypt takes for these parameters
const memoryOf = ({ N, r }: Pick<Parameters, "N" | "r">) => 128 * N * r

function derive(password: string, salt: Buffer, parameters: Parameters, keyLength: number): Promise<Buffer> {
  // Node refuses more than 32 MiB unless maxmem allows it
  const options: ScryptOptions = { ...parameters, maxmem: memoryOf(parameters) + 1024 * 1024 }
  // Normalized so a password typed on another device or keyboard layout still matches
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFC"), salt, keyLength, options, (error, key) => (error ? reject(error) : resolve(key)))
  )
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const key = await derive(password, salt, PARAMETERS, KEY_BYTES)
  const { N, r, p } = PARAMETERS
  return ["scrypt", N, r, p, salt.toString("base64url"), key.toString("base64url")].join("$")
}

function parseHash(hash: string) {
  const [scheme, cost, blockSize, parallelization, salt, key, ...rest] = hash.split("$")
  const [N, r, p] = [cost, blockSize, parallelization].map(Number)
  if (scheme !== "scrypt" || rest.length || !salt || !key) return undefined
  if (!Number.isInteger(N) || N < 2 || (N & (N - 1)) !== 0) return undefined
  if (!Number.isInteger(r) || r < 1 || !Number.isInteger(p) || p < 1 || p > MAX_PARALLELIZATION) return undefined
  if (memoryOf({ N, r }) > MAX_MEMORY_BYTES) return undefined

  const keyBuffer = Buffer.from(key, "base64url")
  if (keyBuffer.length < 16) return undefined
  return { parameters: { N, r, p }, salt: Buffer.from(salt, "base64url"), key: keyBuffer }
}

// Whether the password matches the hash, compared in constant time. False for a hash this code can't read
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const parsed = parseHash(hash)
  if (!parsed) return false

  const key = await derive(password, parsed.salt, parsed.parameters, parsed.key.length)
  return timingSafeEqual(key, parsed.key)
}

// Whether a hash was made with other parameters than today's, so it should be replaced once its password is known
export function needsRehash(hash: string): boolean {
  const parsed = parseHash(hash)
  return !parsed || parsed.parameters.N !== PARAMETERS.N || parsed.parameters.r !== PARAMETERS.r || parsed.parameters.p !== PARAMETERS.p
}

// Checks a password for an unknown email so it takes as long as a known one: one derivation with today's parameters, the
// same work as verifying a current hash, never a match
const DUMMY_SALT = randomBytes(SALT_BYTES)

export async function verifyDummyPassword(password: string): Promise<false> {
  await derive(password, DUMMY_SALT, PARAMETERS, KEY_BYTES)
  return false
}

// A temporary password an admin is given once: 24 base64url characters, 144 random bits
export const generateTemporaryPassword = () => randomBytes(18).toString("base64url")
