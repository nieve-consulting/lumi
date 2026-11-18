import { z } from "zod"

export const API_KEY_NAME_MAX_LENGTH = 100

// The API's rule for a key's name: trimmed, 1 to 100 characters
export const apiKeyNameSchema = z
  .string({ error: "Enter a name" })
  .trim()
  .min(1, "Enter a name")
  .max(API_KEY_NAME_MAX_LENGTH, `Use at most ${API_KEY_NAME_MAX_LENGTH} characters`)
