"use client"

import Image from "next/image"
import type { Client, TeamMember } from "@/generated/graphql"
import type { HandoffCardPayload } from "@lumi/shared-contracts/handoff"
import type { JobOpeningCard } from "@lumi/shared-contracts/knowledge"
import { ChevronDown, ExternalLink, Globe } from "lucide-react"

import { useBusiness } from "@/lib/BusinessProvider"
import { useI18n } from "@/lib/i18n/LanguageProvider"
import { getMessageText, type Card, type LumiMessage, type Reference } from "@/lib/types"
import LumiMarkdown from "@/components/LumiMarkdown"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

import ClientCard from "./customCards/ClientCard"
import ErrorCard from "./customCards/ErrorCard"
import Handoff from "./customCards/Handoff"
import JobOpening from "./customCards/JobOpening"
import MeetingPicker, { type MeetingDataCardPayload } from "./customCards/MeetingPicker"
import ProjectCard, { type ProjectCardPayload } from "./customCards/ProjectCard"
import TeamMemberCard from "./customCards/TeamMemberCard"

function MessageCards({ cards }: { cards: Card[] }) {
  const { t } = useI18n()
  // The handoff card follows the meeting picker as its alternative, so they stack rather than share the row
  const handoff = cards.some((card) => card.card_type === "handoff")
  const withPicker = cards.some((card) => card.card_type === "meeting_picker")

  // A row of cards wider than the message, such as many team members, scrolls on its own rather than the whole chat
  return (
    <div className={handoff ? "mt-2 flex flex-col gap-2" : "mt-2 flex gap-2 overflow-x-auto pb-1"}>
      {cards.map((card) => {
        if (card.id) {
          switch (card.card_type) {
            case "project":
              return <ProjectCard key={card.id} project={card.payload as ProjectCardPayload} />

            case "team_member":
              return <TeamMemberCard key={card.id} teamMember={card.payload as TeamMember} />

            case "client":
              return <ClientCard key={card.id} client={card.payload as Client} />

            case "meeting_picker":
              return <MeetingPicker key={card.id} data={card.payload as MeetingDataCardPayload} />

            case "handoff":
              return <Handoff key={card.id} data={card.payload as HandoffCardPayload} alongsidePicker={withPicker} />

            case "job_opening":
              return <JobOpening key={card.id} job={card.payload as JobOpeningCard} />

            default:
              return <ErrorCard key={card.id} error={t.messages.unknownCard(card.card_type)} />
          }
        }
      })}
    </div>
  )
}

// The website pages a reply drew on, collapsed to one line so they don't crowd the conversation. Long titles stay on one line
function MessageSources({ references }: { references: Reference[] }) {
  const { t } = useI18n()

  return (
    <Collapsible className="mt-1 text-xs text-slate-500">
      <CollapsibleTrigger className="group inline-flex items-center gap-1 rounded py-1 outline-none hover:text-slate-700 hover:underline focus-visible:ring-2 focus-visible:ring-ring">
        {t.messages.sources(references.length)}
        <ChevronDown size={14} aria-hidden className="transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex flex-col pb-1">
          {references.map((reference, idx) => (
            <li key={idx} className="flex min-w-0 items-center gap-1.5">
              <Globe size={13} aria-hidden className="shrink-0" />
              <a target="_references" href={reference.url} title={reference.title} className="flex min-w-0 items-center gap-1 rounded py-1 outline-none hover:text-slate-700 hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                <span className="truncate">{reference.title}</span>
                <ExternalLink size={11} aria-hidden className="shrink-0" />
                <span className="sr-only">{t.messages.opensInNewTab}</span>
              </a>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

interface IProps {
  ref?: React.Ref<HTMLDivElement>
  tabIndex?: number
  message: LumiMessage
  isStreaming?: boolean
}

export default function AssistantMessage({ ref, tabIndex, message, isStreaming }: IProps) {
  const { avatar, assistantName } = useBusiness()
  const messageAnnotation = message.metadata

  return (
    <div className="my-2 mr-6 flex gap-2 lg:mr-36" ref={ref} tabIndex={tabIndex}>
      <Image src={avatar} alt={assistantName} width={80} height={80} className="size-10 shrink-0 object-contain" />
      {/* min-w-0 keeps the message within the chat's width, so a wide row of cards scrolls inside it */}
      <div className="w-full min-w-0">
        <div className="rounded-md bg-slate-300 px-4 py-2">
          <LumiMarkdown key="0" isAnimating={isStreaming}>
            {getMessageText(message)}
          </LumiMarkdown>
        </div>
        {messageAnnotation?.cards && <MessageCards cards={messageAnnotation.cards} />}
        {!!messageAnnotation?.references?.length && <MessageSources references={messageAnnotation.references} />}
      </div>
    </div>
  )
}
