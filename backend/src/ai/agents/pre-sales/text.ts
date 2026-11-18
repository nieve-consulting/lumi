import { RunnableConfig } from "@langchain/core/runnables"
import { inSentence, type SourceLabel } from "@lumi/shared-contracts/knowledge"
import { matchLanguage, type Language } from "@lumi/shared-contracts/language"

import { ensureConfiguration } from "./configuration"
import type { AgentStateType } from "./state"

// Fixed text the agents API writes into conversations, in each language the chat can be shown in. Status updates are in the
// chat's language, like the rest of its interface; fixed replies follow the visitor's language like Lumi's generated ones.
// The greeting lives in shared-contracts, as the chat shows it before a thread exists
type PreSalesText = {
  // Shown while Lumi works, never saved on the thread. The structured sources' texts take the source's label (see
  // src/knowledge.ts): labels are English only, so the other languages word them without naming the source
  status: {
    gatheringInformation: string
    fetchingCompanyInfo: string
    fetchingTeamMembers: (label: SourceLabel) => string
    fetchingTeamMember: (label: SourceLabel) => string
    fetchingProjects: (label: SourceLabel) => string
    fetchingProject: (label: SourceLabel) => string
    fetchingClients: (label: SourceLabel) => string
    fetchingClient: (label: SourceLabel) => string
    fetchingJobOpenings: (label: SourceLabel) => string
    fetchingJobOpening: (label: SourceLabel) => string
    searchingWebpages: string
    readingCurrentPage: string
  }
  // Lumi's reply when every tool result shows a card, so the model is skipped. Fixed replies, see replyText
  cardIntro: (name: string) => string
  // The intros of the handoff (see handoffNode), by what the business offers: the calendar picker, a booking page, an enquiry
  // form, or nothing, which points to the contact link (see contactHref) or says the team can't be reached from the chat
  meetingPicker: string
  meetingPickerOrEnquiry: string
  bookingLink: string
  bookingLinkOrEnquiry: string
  enquiry: string
  noHandoff: (contact: string | undefined) => string
  // Replaces the enquiry form once a delivery channel accepted the enquiry
  enquiryConfirmation: (contact: string | undefined) => string
  // `when` is the formatted meeting time with its time zone. Links the team's contact page or address when the installation
  // sets one (see contactHref)
  bookingConfirmation: (when: string, email: string, contact: string | undefined) => string
}

const TEXT: Record<Language, PreSalesText> = {
  en: {
    status: {
      gatheringInformation: "Gathering information...",
      fetchingCompanyInfo: "Fetching company info...",
      fetchingTeamMembers: ({ plural }) => `Fetching ${inSentence(plural)}...`,
      fetchingTeamMember: ({ singular }) => `Fetching ${inSentence(singular)} information...`,
      fetchingProjects: ({ plural }) => `Fetching ${inSentence(plural)}...`,
      fetchingProject: ({ singular }) => `Fetching ${inSentence(singular)} information...`,
      fetchingClients: ({ plural }) => `Fetching ${inSentence(plural)}...`,
      fetchingClient: ({ singular }) => `Fetching ${inSentence(singular)} information...`,
      fetchingJobOpenings: ({ plural }) => `Fetching ${inSentence(plural)}...`,
      fetchingJobOpening: ({ singular }) => `Fetching ${inSentence(singular)} information...`,
      searchingWebpages: "Looking for information...",
      readingCurrentPage: "Reading this page...",
    },
    cardIntro: (name) => `Here's some info about ${name}`,
    meetingPicker: "Please pick a time to meet with us",
    meetingPickerOrEnquiry: "Pick a time to meet with us, or send your details to our team and they'll get back to you.",
    bookingLink: "You can book a time with our team on our booking page.",
    bookingLinkOrEnquiry: "You can book a time with our team on our booking page, or send your details to our team and they'll get back to you.",
    enquiry: "Check your details below and send them to our team, and they'll get back to you.",
    noHandoff: (contact) =>
      contact
        ? `I can't book meetings or pass on your details from this chat, but you can [contact our team](${contact}) directly. I'm happy to keep answering your questions here in the meantime.`
        : "I'm sorry, I can't book meetings or pass on your details from this chat. I'm happy to keep answering your questions here.",
    enquiryConfirmation: (contact) =>
      [
        "Thank you, your enquiry has been sent. Our team will reply to you soon.",
        contact ? `This conversation is now closed. To add anything, [contact our team](${contact}).` : "This conversation is now closed.",
      ].join("\n\n"),
    bookingConfirmation: (when, email, contact) =>
      [
        `Your meeting is booked for ${when}. A calendar invitation is on its way to **${email}**.`,
        contact
          ? `This conversation is now closed. To change the time or add details, [contact our team](${contact}).`
          : "This conversation is now closed.",
      ].join("\n\n"),
  },
  es: {
    status: {
      gatheringInformation: "Recopilando información...",
      fetchingCompanyInfo: "Consultando la información de la empresa...",
      fetchingTeamMembers: () => "Buscando información del equipo...",
      fetchingTeamMember: () => "Buscando el perfil...",
      fetchingProjects: () => "Buscando información...",
      fetchingProject: () => "Buscando los detalles...",
      fetchingClients: () => "Buscando información...",
      fetchingClient: () => "Buscando los detalles...",
      fetchingJobOpenings: () => "Buscando información...",
      fetchingJobOpening: () => "Buscando los detalles...",
      searchingWebpages: "Buscando información...",
      readingCurrentPage: "Leyendo esta página...",
    },
    cardIntro: (name) => `Aquí tienes información sobre ${name}`,
    meetingPicker: "Elige un día y una hora para reunirte con nosotros",
    meetingPickerOrEnquiry: "Elige un día y una hora para reunirte con nosotros, o envía tus datos a nuestro equipo y te responderá.",
    bookingLink: "Puedes reservar una reunión con nuestro equipo en nuestra página de reservas.",
    bookingLinkOrEnquiry:
      "Puedes reservar una reunión con nuestro equipo en nuestra página de reservas, o enviar tus datos a nuestro equipo y te responderá.",
    enquiry: "Revisa tus datos a continuación y envíalos a nuestro equipo, que te responderá.",
    noHandoff: (contact) =>
      contact
        ? `No puedo reservar reuniones ni enviar tus datos desde este chat, pero puedes [contactar con nuestro equipo](${contact}) directamente. Mientras tanto, sigo aquí para responder a tus preguntas.`
        : "Lo siento, no puedo reservar reuniones ni enviar tus datos desde este chat. Sigo aquí para responder a tus preguntas.",
    enquiryConfirmation: (contact) =>
      [
        "Gracias, hemos enviado tu consulta. Nuestro equipo te responderá pronto.",
        contact
          ? `Esta conversación ya está cerrada. Para añadir algo, [contacta con nuestro equipo](${contact}).`
          : "Esta conversación ya está cerrada.",
      ].join("\n\n"),
    bookingConfirmation: (when, email, contact) =>
      [
        `Tu reunión está reservada para el ${when}. Recibirás una invitación de calendario en **${email}**.`,
        contact
          ? `Esta conversación ya está cerrada. Para cambiar la hora o añadir detalles, [contacta con nuestro equipo](${contact}).`
          : "Esta conversación ya está cerrada.",
      ].join("\n\n"),
  },
}

// The fixed intro that replaces the model's reply to a card, when the card's record was returned in the visitor's language.
// None when it was returned in English, so the model replies in the visitor's language with the content the card shows
export function cardIntro(language: Language, contentLanguage: Language, name: string): { directMessage?: string } {
  return contentLanguage === language ? { directMessage: TEXT[language].cardIntro(name) } : {}
}

export function preSalesText(language: Language) {
  return TEXT[language]
}

// The text in the chat's language, set from the turn request (see ensureConfiguration), for status updates
export function runText(config: RunnableConfig) {
  return TEXT[ensureConfiguration(config).language]
}

// The language of the visitor's latest message, which Lumi replies in, or the chat's when the visitor's isn't one the chat
// has. Lumi's fixed replies are written in it, and the record tools read content in it so Lumi answers from the team's
// reviewed text and a card matches its intro. A record with no text in the language is returned in English (see cardIntro)
export function visitorLanguage(state: AgentStateType, config: RunnableConfig): Language {
  return matchLanguage(state.replyLanguage) ?? ensureConfiguration(config).language
}

// The text in the visitor's language, for Lumi's fixed replies, so they don't switch language when the visitor writes in
// another one than the chat's
export function replyText(state: AgentStateType, config: RunnableConfig) {
  return TEXT[visitorLanguage(state, config)]
}
