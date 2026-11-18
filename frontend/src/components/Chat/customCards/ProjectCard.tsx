import Image from "next/image"
import type { Client, Project } from "@/generated/graphql"
import clsx from "clsx"
import { ExternalLink } from "lucide-react"
import { DateTime } from "luxon"

import { useFormattingLocale, useI18n } from "@/lib/i18n/LanguageProvider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import LumiMarkdown from "@/components/LumiMarkdown"

// The project card's payload. Its client is null when undisclosed, and left out while clients are off
export type ProjectCardPayload = Partial<Omit<Project, "client">> & { client?: Pick<Client, "name" | "logo_key"> | null }

interface IProps {
  project: ProjectCardPayload
  className?: string
}

export default function ProjectCard({ project, className }: IProps) {
  const { t } = useI18n()
  const locale = useFormattingLocale()
  const description = project?.description || project?.summary
  const formatMonth = (date: string) => DateTime.fromISO(date).toFormat(t.cards.projectMonthFormat, { locale })

  return (
    <Card className={clsx("max-w-[50%] min-w-[360px] overflow-hidden border-indigo-200 bg-indigo-100", className)}>
      {project?.image_key && (
        <div className="relative aspect-video w-full bg-slate-100">
          <Image src={`/media/${project.image_key}?w=1000`} alt={project.name || t.cards.project} className="object-cover" fill sizes="50vw" />
        </div>
      )}
      <CardHeader>
        <CardTitle>{project.name}</CardTitle>
        {project.client !== undefined && (
          <CardDescription>
            {project.client?.logo_key && (
              <Image
                src={`/media/${project.client.logo_key}?w=60&h=60`}
                alt={project.client.name}
                width={30}
                height={30}
                className="mr-2 inline-block rounded-full"
              />
            )}
            {project.client?.name || t.cards.undisclosedClient}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="mb-5 max-h-[150px] overflow-y-scroll">
        <CardDescription>
          {project?.start_date &&
            t.cards.projectPeriod(formatMonth(project.start_date), project.end_date ? formatMonth(project.end_date) : undefined)}
          {description && (
            <div className="prose prose-sm mt-4 max-w-none">
              <LumiMarkdown>{description}</LumiMarkdown>
            </div>
          )}
        </CardDescription>
      </CardContent>
      {project?.webpage && (
        <CardFooter className="justify-between">
          <Button asChild variant="outline">
            <a href={project.webpage} className="no-underline" target="_blank">
              {t.cards.projectPage} <ExternalLink className="ml-1 inline" size={15} />
            </a>
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
