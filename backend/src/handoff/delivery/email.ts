import { emailFrom, sendEmail } from "@/utils/email"

import type { DeliveryChannel } from "./types"

// Emails each enquiry to the channel's recipients through the backend's email transport (src/utils/email.ts: from
// EMAIL_FROM, through SMTP_URL or Amazon SES). Without EMAIL_FROM the server has no sender, so admins can't set up an email
// channel

// Headers are one line: the topic and the name come from the conversation
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim()

export const emailChannel: DeliveryChannel<"email"> = {
  type: "email",
  available: () => (emailFrom() ? { available: true } : { available: false, reason: "Email delivery isn't set up on this server: set EMAIL_FROM" }),
  describe: ({ recipients }) => recipients.join(", "),
  async deliver(enquiry, { recipients }, { idempotencyKey }) {
    const from = emailFrom()
    if (!from) throw new Error("Email delivery isn't set up on this server: set EMAIL_FROM")

    // Rendered on first use, so the agents API only loads the email template when it sends one
    const { enquiryEmail } = await import("./enquiryEmail")
    const { html, text } = await enquiryEmail(enquiry)
    const about = enquiry.topic || enquiry.contact.name || enquiry.contact.company || enquiry.contact.email || "New enquiry"
    // The same Message-ID on every attempt, so mail clients that dedupe by it show a resent enquiry once
    const domain = from.match(/@([^\s>]+)/)?.[1] ?? "lumi.invalid"

    try {
      await sendEmail({
        to: recipients,
        // The team replies straight to the visitor
        replyTo: enquiry.contact.email,
        subject: `[Lumi enquiry] ${oneLine(about).slice(0, 150)}`,
        messageId: `<${idempotencyKey.replace(/[^\w.-]/g, ".")}@${domain}>`,
        html,
        text,
      })
    } catch (error) {
      throw new Error(`The email couldn't be sent: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
  },
}
