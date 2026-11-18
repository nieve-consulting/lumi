// Whether a secret still holds a placeholder from deploy/.env.example, e.g. "replace-with-a-random-value" or "sk-replace-me".
// The file is published, so such a value is no secret: the services refuse it (backend/src/container/config.ts) and the web
// app treats it as unset (frontend/src/lib/auth/config.ts, frontend/src/lib/setupToken.ts)
export const isPlaceholderSecret = (value: string) => /replace-(with|me)/i.test(value)
