import Image from "next/image"
import Link from "next/link"

interface BrandProps {
  // Called when the link navigates in this tab, but not when it opens in a new tab or window
  onNavigate?: () => void
}

export default function Brand({ onNavigate }: BrandProps) {
  return (
    <Link
      href="/admin"
      onNavigate={onNavigate}
      className="focus-visible:ring-ring flex items-center gap-2 rounded-md px-3 py-1.5 text-lg font-semibold text-slate-900 outline-hidden focus-visible:ring-2 focus-visible:ring-inset"
    >
      <Image src="/images/lumi-pebble.webp" alt="" height={32} width={32} />
      Lumi
    </Link>
  )
}
