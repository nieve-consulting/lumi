import Image from "next/image"

export default function NotFound() {
  return (
    <div className="h-screen w-full content-center bg-slate-300 text-center">
      <Image src="/images/lumi-pebble.webp" alt="Lumi" width={300} height={300} className="mb-2 inline" />
      <h1 className="mb-5 text-3xl font-bold">404 Not Found</h1>
      <p className="text-slate-500">Sorry, the page you are looking for does not exist.</p>
    </div>
  )
}
