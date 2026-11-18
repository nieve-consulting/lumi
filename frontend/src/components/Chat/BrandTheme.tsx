// The installation's primary colour on a chat page, as the HSL triplets the theme's variables hold (see globals.css). Set on
// :root rather than on a wrapper so dialogs and menus, which Radix portals to the end of the body, use it too. The admin
// pages don't render it and keep the default theme

// "H S% L%" of a #rrggbb colour
function hslTriplet(hex: string) {
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  const delta = max - min
  let hue = 0
  let saturation = 0
  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1))
    if (max === r) hue = ((g - b) / delta) % 6
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4
    hue = (hue * 60 + 360) % 360
  }
  const round = (value: number) => Math.round(value * 100) / 100
  return `${round(hue)} ${round(saturation * 100)}% ${round(lightness * 100)}%`
}

interface IProps {
  // Lowercase #rrggbb, validated dark enough for white text (see PublicBusinessConfig)
  primaryColor?: string
}

export default function BrandTheme({ primaryColor }: IProps) {
  if (!primaryColor || !/^#[0-9a-f]{6}$/.test(primaryColor)) return null
  const color = hslTriplet(primaryColor)
  // Unlayered, so it overrides the theme's defaults in the base layer wherever it lands in the page
  return <style>{`:root{--primary:${color};--ring:${color};--primary-foreground:0 0% 100%}`}</style>
}
