"use client"

import { useState } from "react"
import Image from "next/image"
import { LANGUAGE_NAMES, LANGUAGES } from "@lumi/shared-contracts/language"
import { EllipsisVertical, Info, Languages, MessageCircle } from "lucide-react"

import { useBusiness } from "@/lib/BusinessProvider"
import { useI18n } from "@/lib/i18n/LanguageProvider"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import NewConversation from "./NewConversattion"

interface IProps {
  ref?: React.Ref<HTMLButtonElement>
  version: string
  commitId: string
}

export default function Menu({ ref, version, commitId }: IProps) {
  const { language, t, setLanguage } = useI18n()
  const { avatar, assistantName, businessName, logoUrl } = useBusiness()
  const [newChatDlgOpen, setNewChatDlgOpen] = useState(false)
  const [aboutDlgOpen, setAboutDlgOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={ref} variant="outline" className="rounded-md p-2" aria-label={t.menu.label}>
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => setNewChatDlgOpen(true)}>
            <MessageCircle className="mr-2 size-4" />
            <span>{t.menu.newChat}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* Each language by its own name, announced in that language */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Languages className="mr-2 size-4" aria-hidden />
              <span>{t.menu.language}</span>
              <span lang={language} className="mr-1 ml-4 text-slate-500">
                {LANGUAGE_NAMES[language]}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                aria-label={t.menu.language}
                value={language}
                onValueChange={(value) => {
                  const selected = LANGUAGES.find((option) => option === value)
                  if (selected) setLanguage(selected)
                }}
              >
                {LANGUAGES.map((option) => (
                  <DropdownMenuRadioItem key={option} value={option} lang={option}>
                    {LANGUAGE_NAMES[option]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={() => setAboutDlgOpen(true)}>
            <Info className="mr-2 size-4" />
            <span>{t.menu.about}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={aboutDlgOpen} onOpenChange={setAboutDlgOpen}>
        <AlertDialogContent className="w-11/12">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center">
              {t.about.titleBy}{" "}
              {logoUrl ? (
                <Image src={logoUrl} width={60} height={60} alt={businessName} className="inline-block h-[35px] w-auto align-middle" />
              ) : (
                businessName
              )}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription asChild>
            <div>
              <Image src={avatar} width={200} height={200} alt={assistantName} className="mx-auto mb-3 object-contain" />
              <div>{t.about.body}</div>
              <div className="mt-5 text-center text-xs">
                v{version}({commitId})
              </div>
            </div>
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.close}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NewConversation open={newChatDlgOpen} setOpen={setNewChatDlgOpen} />
    </>
  )
}
