import { Fragment } from "react"
import { notFound } from "next/navigation"
import type { Query, QueryThreadArgs, Thread } from "@/generated/graphql"
import { gql } from "@apollo/client"

import { getAdminClient } from "@/lib/adminApiClient"
import { getThreadMessages } from "@/lib/agentsAdmin"
import { getBusiness } from "@/lib/business"
import { BusinessProvider } from "@/lib/BusinessProvider"
import { UNSET_BUSINESS } from "@/lib/businessSettings"
import { offersResumes } from "@/lib/resume"
import { getLangfuseSessionUrl } from "@/lib/serverConfig"
import { getMessageText } from "@/lib/types"
import AssistantMessage from "@/components/Chat/AssistantMessage"
import UserMessage from "@/components/Chat/UserMessage"

import ConversationCrumbs from "./components/ConversationCrumbs"
import CostSection from "./components/CostSection"
import EnquirySection from "./components/EnquirySection"
import SummarySection from "./components/SummarySection"
import { ENQUIRY_FRAGMENT } from "./enquiryQuery"

interface IProps {
  params: Promise<{ id: string }>
}

async function getThread(id: string): Promise<Thread | null> {
  const client = await getAdminClient()

  return client
    .query<Query, QueryThreadArgs>({
      query: gql`
        query ($id: ID!) {
          thread(id: $id) {
            id
            email
            createdAt
            closed
            topic
            summary
            name
            phone
            pageUrl
            cost
            enquiries {
              ...EnquiryFields
            }
            usage {
              purpose
              model
              calls
              inputTokens
              cachedInputTokens
              cacheWriteTokens
              outputTokens
              reasoningTokens
              cost
            }
          }
        }
        ${ENQUIRY_FRAGMENT}
      `,
      variables: { id },
    })
    .then(({ data }) => data?.thread || null)
}

export async function generateMetadata({ params }: IProps) {
  const { id } = await params
  const thread = await getThread(id)

  if (!thread) {
    return notFound()
  }

  return { title: thread.topic || "Conversation" }
}

export default async function ConversationPage({ params }: IProps) {
  const { id } = await params
  // The assistant's messages show with its name and picture, Lumi's own while that can't be read
  const [messages, thread, business, resumes] = await Promise.all([
    getThreadMessages(id),
    getThread(id),
    getBusiness().catch(() => null),
    offersResumes(),
  ])

  if (!thread) {
    return notFound()
  }

  return (
    <>
      <ConversationCrumbs topic={thread.topic} />
      <SummarySection thread={thread} langfuseUrl={getLangfuseSessionUrl(thread.id)} className="mb-6 border-b pb-6" />
      <EnquirySection enquiries={thread.enquiries} className="mb-6 border-b pb-6" />
      <CostSection thread={thread} className="mb-6 border-b pb-6" />
      <BusinessProvider config={business ?? UNSET_BUSINESS} resumes={resumes}>
        <div>
          {messages.map((message, idx) => (
            <Fragment key={idx}>
              {message.role === "assistant" && getMessageText(message) !== "" && <AssistantMessage message={message} />}
              {message.role === "user" && <UserMessage message={message} />}
            </Fragment>
          ))}
        </div>
      </BusinessProvider>
    </>
  )
}
