import Image from "next/image"

interface AuthCardProps {
  title: string
  children: React.ReactNode
}

export default function AuthCard({ title, children }: AuthCardProps) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-300 p-4">
      <div className="w-full max-w-sm rounded bg-white p-8 text-center shadow">
        <Image src="/images/lumi-pebble.webp" alt="Lumi" width={96} height={96} className="mb-4 inline" />
        <h1 className="mb-4 text-2xl font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  )
}
