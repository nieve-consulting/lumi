// An image of the business at the height it's shown at. An upload, which the web app serves at /media/<key>, is resized to it
// (twice as tall, for sharp screens) at its own width, so a large original isn't downloaded to be shown small. A size the path
// already asks for, e.g. /media/<key>?w=160 copied from another image, gives way to that height; an address is left as it is
export function sizedImage(url: string, height: number) {
  if (!url.startsWith("/media/")) return url
  const mark = url.indexOf("?")
  const [path, query] = mark === -1 ? [url, ""] : [url.slice(0, mark), url.slice(mark + 1)]
  const params = new URLSearchParams(query)
  params.delete("w")
  params.set("h", String(height * 2))
  return `${path}?${params}`
}
