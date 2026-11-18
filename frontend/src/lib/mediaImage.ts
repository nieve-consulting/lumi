// An image of the business at the height it's shown at. An upload, which the web app serves at /media/<key>, is resized to it
// (twice as tall, for sharp screens) so a large original isn't downloaded to be shown small; an address is left as it is
export function sizedImage(url: string, height: number) {
  return url.startsWith("/media/") ? `${url}?h=${height * 2}` : url
}
