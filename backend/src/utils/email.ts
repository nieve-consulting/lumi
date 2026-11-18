import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2"
import * as nodemailer from "nodemailer"

// How the backend sends email: from EMAIL_FROM, through the SMTP server at SMTP_URL when set (e.g.
// smtp://user:pass@smtp.example.com:587, or a local mail catcher), else through Amazon SES, where EMAIL_FROM must be a
// verified identity. Without EMAIL_FROM the installation has no sender, so nothing is sent from an address it doesn't own.
// Used by the enquiry emails (src/handoff/delivery/email.ts) and the meeting emails to the hosts (AwsDataSource.sendEmail)

export const emailFrom = () => process.env.EMAIL_FROM?.trim() || undefined

// One per process, so a warm Lambda reuses its connection and credentials
let transporter: nodemailer.Transporter | undefined

function transport() {
  const smtpUrl = process.env.SMTP_URL?.trim()
  transporter ??= smtpUrl
    ? nodemailer.createTransport({ url: smtpUrl, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 })
    : nodemailer.createTransport({ SES: { sesClient: new SESv2Client({ region: process.env.AWS_REGION }), SendEmailCommand } })
  return transporter
}

export type EmailMessage = Omit<nodemailer.SendMailOptions, "from">

// Sends the message from EMAIL_FROM; throws when there is no sender or the server didn't accept it
export async function sendEmail(message: EmailMessage) {
  const from = emailFrom()
  if (!from) throw new Error("Email isn't set up on this server: set EMAIL_FROM")

  await transport().sendMail({ ...message, from })
}
