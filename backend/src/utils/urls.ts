// Absolute URL on the Lumi web app (APP_BASE_URL), used for links that leave the chat or the API, such as media and the calendar event
export function appUrl(path: string) {
  return new URL(path, process.env.APP_BASE_URL || "http://localhost:3000").toString()
}
