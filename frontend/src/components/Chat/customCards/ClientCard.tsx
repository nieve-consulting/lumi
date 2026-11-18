import Image from "next/image"
import { Client } from "@/generated/graphql"
import clsx from "clsx"

import { useI18n } from "@/lib/i18n/LanguageProvider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import LumiMarkdown from "@/components/LumiMarkdown"

interface IProps {
  client: Partial<Client>
  className?: string
}

export default function ClientCard({ client, className }: IProps) {
  const { t } = useI18n()

  return (
    <Card className={clsx("max-w-[50%] min-w-[360px] border-teal-300 bg-teal-100", className)}>
      <CardHeader>
        <CardTitle>
          {client?.logo_key && (
            <Image
              src={`/media/${client.logo_key}?w=60`}
              alt={client.name || t.cards.client}
              width={30}
              height={30}
              className="mr-2 inline-block rounded-full"
            />
          )}
          {client.name}
        </CardTitle>
        <CardDescription className="text-xs">{client?.summary}</CardDescription>
      </CardHeader>
      <CardContent className="mb-5 max-h-[150px] overflow-y-scroll">
        <CardDescription className="prose prose-sm max-w-none">
          {client?.description && <LumiMarkdown>{client.description}</LumiMarkdown>}
          {client?.projects && client.projects?.length > 0 && (
            <>
              <h3 className="my-2 font-medium">{t.cards.projects}</h3>
              <ul className="mb-2">{client.projects.map((project) => project?.name && <li key={project.id}>{project.name}</li>)}</ul>
            </>
          )}
        </CardDescription>
      </CardContent>
    </Card>
  )
}
