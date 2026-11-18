"use client"

import Link from "next/link"
import { KeyRound, LogOut } from "lucide-react"
import { signOut } from "next-auth/react"

import { CHANGE_PASSWORD_PATH, SIGN_IN_PATH } from "@/lib/auth/paths"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface UserMenuProps {
  email: string
  name?: string | null
  image?: string | null
  // Local mode: admins manage their own password
  canChangePassword?: boolean
}

export default function UserMenu({ email, name, image, canChangePassword }: UserMenuProps) {
  const initials = (name || email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full" aria-label="Account">
        <Avatar>
          {image && <AvatarImage src={image} alt="" referrerPolicy="no-referrer" />}
          <AvatarFallback className="bg-slate-400 text-white">{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-normal">
          {name && <div className="font-medium">{name}</div>}
          <div className="text-slate-500">{email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {canChangePassword && (
          <DropdownMenuItem asChild>
            <Link href={CHANGE_PASSWORD_PATH}>
              <KeyRound className="mr-2 h-4 w-4" /> Change password
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => signOut({ callbackUrl: SIGN_IN_PATH })}>
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
