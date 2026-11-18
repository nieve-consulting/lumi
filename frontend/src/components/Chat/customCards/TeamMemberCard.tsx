import Image from "next/image"
import { TeamMember } from "@/generated/graphql"
import { DEFAULT_LANGUAGE, matchLanguage } from "@lumi/shared-contracts/language"
import { teamMemberResumePath } from "@lumi/shared-contracts/resume"
import clsx from "clsx"
import { DownloadCloud, ExternalLink, User } from "lucide-react"

import { useBusiness } from "@/lib/BusinessProvider"
import { useI18n } from "@/lib/i18n/LanguageProvider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import LumiMarkdown from "@/components/LumiMarkdown"

interface IProps {
  teamMember: Partial<TeamMember>
  className?: string
}

export default function TeamMemberCard({ teamMember, className }: IProps) {
  const { t, language, provided } = useI18n()
  // Cards of older conversations were made while resumes were on, so the chat asks whether they still are
  const { resumes } = useBusiness()
  // In the chat the resume is in the chat's language, like the rest of its interface; its content falls back to English where
  // it has no translation, as the card's does. The admin's view of a conversation has no chat language, so it links the resume
  // in the language the card's content was returned in (English for cards of older conversations, which have none)
  const resumeLanguage = provided ? language : (matchLanguage(teamMember.language) ?? DEFAULT_LANGUAGE)
  const pdfUrl = teamMemberResumePath(teamMember.id ?? "", resumeLanguage)

  return (
    <Card className={clsx("max-w-[50%] min-w-[360px] border-sky-300 bg-sky-100", className)}>
      <CardHeader>
        <div className="flex gap-5">
          {teamMember?.profile_photo_key ? (
            <Image
              src={`/media/${teamMember.profile_photo_key}?w=240&h=240`}
              alt={teamMember.name || t.cards.teamMember}
              width={120}
              height={120}
              className="my-auto max-h-[120px] rounded-full"
            />
          ) : (
            <div className="size-[120px] min-w-[120px] rounded-full bg-slate-100">
              <User size={70} className="mx-auto mt-5 text-slate-300" />
            </div>
          )}
          <div className="content-center">
            <CardTitle className="mb-2">{teamMember.name}</CardTitle>
            <CardDescription>{teamMember?.job_title}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="mb-5 max-h-[150px] overflow-y-scroll">
        <CardDescription className="prose prose-sm max-w-none">
          {teamMember?.bio && <LumiMarkdown>{teamMember.bio}</LumiMarkdown>}

          {teamMember?.capability_highlights && <LumiMarkdown>{teamMember.capability_highlights}</LumiMarkdown>}
        </CardDescription>
      </CardContent>
      {/* The profile page and the resume each show on their own: a team member without a web page still has a resume */}
      {(teamMember?.webpage || resumes) && (
        <CardFooter className="flex-col justify-between gap-2 lg:flex-row">
          {teamMember?.webpage && (
            <Button asChild variant="outline">
              <a href={teamMember.webpage} className="w-full no-underline" target="_blank">
                {t.cards.fullProfile} <ExternalLink className="ml-1 inline" size={15} />
              </a>
            </Button>
          )}
          {resumes && (
            <Button asChild>
              <a href={pdfUrl} className="w-full no-underline" target="_blank">
                {t.cards.downloadPdf}
                <DownloadCloud className="ml-1 inline" size={15} />
              </a>
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  )
}
