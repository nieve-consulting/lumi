"use client"

import Image from "next/image"
import type { Client, TeamMember } from "@/generated/graphql"
import type { HandoffCardPayload } from "@lumi/shared-contracts/handoff"
import type { JobOpeningCard } from "@lumi/shared-contracts/knowledge"
import { ExternalLink, Globe } from "lucide-react"

import { useBusiness } from "@/lib/BusinessProvider"
import { useI18n } from "@/lib/i18n/LanguageProvider"
import { getMessageText, type Card, type LumiMessage } from "@/lib/types"
import LumiMarkdown from "@/components/LumiMarkdown"

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

interface IProps {
  ref?: React.Ref<HTMLDivElement>
  tabIndex?: number
  message: LumiMessage
  isStreaming?: boolean
}

export default function AssistantMessage({ ref, tabIndex, message, isStreaming }: IProps) {
  const { t } = useI18n()
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
        {messageAnnotation?.references && (
          <div className="mt-2 text-xs text-slate-400">
            {t.messages.learnMore}
            <ul>
              {messageAnnotation.references.map((reference, idx) => (
                <li key={idx} className="my-1 list-none">
                  <Globe className="mr-2 inline-block" size={15} />
                  <a target="_references" href={reference.url} className="hover:underline">
                    {reference.title} <ExternalLink className="inline-block" size={11} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
