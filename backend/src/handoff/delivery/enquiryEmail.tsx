import { ENQUIRY_FIELD_LABELS } from "@lumi/shared-contracts/handoff"
import * as React from "react"
import { Body, Container, Head, Heading, Hr, Html, Link, Preview, render, Section, Text } from "react-email"

import { conversationUrl, type DeliverableEnquiry } from "./types"

// The enquiry email the team receives. React escapes every value, so nothing the visitor typed becomes markup. In English,
// like the rest of the team's notifications

const styles = {
  body: { backgroundColor: "#ffffff", fontFamily: "Arial, Helvetica, sans-serif", color: "#111827" },
  label: { margin: "12px 0 0", fontSize: "13px", fontWeight: "bold", color: "#4b5563" },
  value: { margin: "2px 0 0", fontSize: "15px", whiteSpace: "pre-wrap" as const },
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </>
  )
}

function EnquiryEmail({ enquiry }: { enquiry: DeliverableEnquiry }) {
  const contact = Object.entries(ENQUIRY_FIELD_LABELS).flatMap(([field, label]) => {
    const value = enquiry.contact[field as keyof typeof ENQUIRY_FIELD_LABELS]
    return value ? [{ label, value }] : []
  })
  const answered = enquiry.qualification.filter(({ answer }) => answer)

  return (
    <Html lang="en">
      <Head />
      <Preview>{`New enquiry${enquiry.topic ? `: ${enquiry.topic}` : ""}`}</Preview>
      <Body style={styles.body}>
        <Container>
          <Heading as="h1" style={{ fontSize: "20px" }}>
            New enquiry from the chat
          </Heading>
          <Text>A visitor sent this enquiry from a conversation with Lumi. Reply to them directly.</Text>

          <Section>
            <Heading as="h2" style={{ fontSize: "16px" }}>
              Contact
            </Heading>
            {contact.map(({ label, value }) => (
              <Field key={label} label={label} value={value} />
            ))}
          </Section>

          {enquiry.topic || enquiry.message ? (
            <Section>
              <Hr />
              {enquiry.topic ? <Field label="Topic" value={enquiry.topic} /> : null}
              {enquiry.message ? <Field label="What they'd like to discuss" value={enquiry.message} /> : null}
            </Section>
          ) : null}

          {answered.length ? (
            <Section>
              <Hr />
              <Heading as="h2" style={{ fontSize: "16px" }}>
                Qualification
              </Heading>
              {answered.map(({ question, answer }, index) => (
                <Field key={index} label={question} value={answer} />
              ))}
            </Section>
          ) : null}

          <Hr />
          <Text>
            <Link href={conversationUrl(enquiry.threadId)}>View the conversation in Lumi</Link>
          </Text>
          <Text style={{ fontSize: "12px", color: "#6b7280" }}>Enquiry {enquiry.id}</Text>
        </Container>
      </Body>
    </Html>
  )
}

// The same content as plain text, for mail clients that don't show HTML
function enquiryText(enquiry: DeliverableEnquiry) {
  const lines = ["New enquiry from the chat", ""]
  for (const [field, label] of Object.entries(ENQUIRY_FIELD_LABELS)) {
    const value = enquiry.contact[field as keyof typeof ENQUIRY_FIELD_LABELS]
    if (value) lines.push(`${label}: ${value}`)
  }
  if (enquiry.topic) lines.push("", `Topic: ${enquiry.topic}`)
  if (enquiry.message) lines.push("", "What they'd like to discuss:", enquiry.message)
  const answered = enquiry.qualification.filter(({ answer }) => answer)
  if (answered.length) lines.push("", "Qualification:", ...answered.flatMap(({ question, answer }) => [`- ${question}`, `  ${answer}`]))
  lines.push("", `Conversation: ${conversationUrl(enquiry.threadId)}`, `Enquiry ${enquiry.id}`)
  return lines.join("\n")
}

export async function enquiryEmail(enquiry: DeliverableEnquiry) {
  return { html: await render(<EnquiryEmail enquiry={enquiry} />), text: enquiryText(enquiry) }
}
