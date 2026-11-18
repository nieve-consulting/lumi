import type { PublicBusinessConfig } from "@lumi/shared-contracts/business"
import { DEFAULT_ENQUIRY_MESSAGES } from "@lumi/shared-contracts/handoff"
import { inSentence, JOB_WORK_MODE_LABELS, type SourceLabels } from "@lumi/shared-contracts/knowledge"

// Interface text of the public chat, the /widget page and the team member resume PDF in English, the default language and
// the fallback for any string missing from another language. The assistant's replies, knowledge-base content and the text
// the agents API writes are not here

// The names the text uses: the installation's assistant and business (see PublicBusinessConfig)
export type MessageBrand = Pick<PublicBusinessConfig, "assistantName" | "businessName">

const tooManyRequests = (minutes?: number) =>
  `Too many meeting requests and enquiries were sent from your network. Please try again ${minutes ? `in ${minutes} ${minutes === 1 ? "minute" : "minutes"}` : "later"}`

export const en = ({ assistantName, businessName }: MessageBrand) => ({
  metadata: {
    description: `${assistantName} is the virtual AI assistant of ${businessName}`,
  },
  layout: {
    tagline: "Our AI Assistant",
    // Lumi's credit to its makers, the same on every installation: "Made with ❤️ by Nieve in Málaga, Spain"
    madeWith: "Made with ❤️ by",
    madeIn: "in Málaga, Spain",
    // Links Lumi's source code, which the AGPL v3 asks installations to offer their users
    sourceCode: "Source code",
  },
  // The text around the "check with us" link, each part with its own spacing. Without a contact link the parts read as one
  // sentence
  disclaimer: {
    publicBefore: `${assistantName} is an AI agent and can make mistakes. Always `,
    widgetBefore: `${assistantName} is an AI assistant and can make mistakes. Always `,
    link: "check with us",
    after: " before making decisions.",
  },
  common: {
    opensInNewTab: "(opens in a new tab)",
    close: "Close",
    cancel: "Cancel",
    optional: "(optional)",
    // A booking or enquiry refused for too many requests from the visitor's network, with how long to wait when known. The
    // whole message, or the text before the "contact our team" link, which is followed by "."
    tooManyRequests: (minutes?: number) => `${tooManyRequests(minutes)}.`,
    tooManyRequestsBefore: (minutes?: number) => `${tooManyRequests(minutes)} or `,
  },
  menu: {
    label: "Chat options",
    newChat: "Start new chat",
    about: `About ${assistantName}`,
    language: "Language",
  },
  about: {
    // Followed by the business's logo, or its name without one
    titleBy: `${assistantName} by`,
    body: `${assistantName} is an AI agent created by ${businessName} to assist clients and candidates in learning more about our company and services. Designed to provide helpful and relevant information, ${assistantName} aims to enhance your understanding and support your decision-making process. Powered by advanced AI technology, ${assistantName} is your companion for exploring our offerings.`,
  },
  newConversation: {
    title: "Are you sure you want to start a new conversation?",
    cancel: "No",
    confirm: "New Chat",
    starting: "Starting...",
    error: "Error",
  },
  prompt: {
    label: "Message",
    placeholder: "Type a message...",
    closedPlaceholder: "Conversation is closed",
    newLineHint: "Shift+Enter for a new line",
    overLimit: (limit: string) => `Your message is over the ${limit} character limit. Shorten it or send it in parts.`,
    charactersOver: (count: string) => `(${count} ${count === "1" ? "character" : "characters"} over)`,
    charactersLeft: (count: string) => `${count} ${count === "1" ? "character" : "characters"} left`,
    send: "Send message",
    stop: "Stop response",
  },
  messages: {
    thinking: "Thinking...",
    startingChat: "Starting chat...",
    closed: "Conversation is closed",
    startNew: "Start new conversation",
    learnMore: "Learn more here:",
    unknownCard: (cardType: string) => `Unknown Custom UI: ${cardType}`,
  },
  scrollButton: {
    toLatest: "Scroll to the latest message",
    newResponse: "Show new response",
  },
  errors: {
    load: `${assistantName} couldn't load the conversation. Please try again.`,
    start: `${assistantName} couldn't start the conversation. Please try again.`,
    reply: `${assistantName} couldn't reply. Please try again.`,
    // Limits of the agents API (see LIMIT_CODES in the shared contracts). The conversation ones are followed by the closed
    // conversation's "Start new conversation" button
    rateLimited: "Too many messages were sent from your network in a short time. Please wait a minute and try again.",
    // The refused message goes back into the message box
    threadLimit: "This conversation has reached its message limit, so your last message wasn't sent. Start a new conversation below to send it.",
    threadClosed: "This conversation has ended, so your last message wasn't sent. Start a new conversation below to send it.",
    // Followed by the "Contact our team" link
    unavailable: `${assistantName} isn't available right now. You can still reach our team directly.`,
    unavailableWithoutContact: `${assistantName} isn't available right now. Please try again later.`,
    reload: "Reload",
  },
  // Each starter sends its message as the visitor's first
  starters: {
    label: "Suggested topics",
    discussProject: { label: "Discuss a project", message: "I'd like to discuss a project with your team." },
    exploreWork: { label: "Explore our work", message: "What projects have you worked on, and for which clients?" },
    findJobs: { label: "Find job opportunities", message: "What job opportunities do you have?" },
  },
  cards: {
    client: "Client",
    projects: "Projects",
    teamMember: "Team member",
    // A team member's own web page
    fullProfile: "See full profile",
    downloadPdf: "Download PDF",
    // A job opening's link to its own application page, or to the careers page without one
    apply: "Apply",
    careersPage: "See careers page",
    workModes: JOB_WORK_MODE_LABELS,
    // Luxon format of the day a job opening was posted
    postedDateFormat: "d LLLL yyyy",
    postedOn: (date: string) => `Posted on ${date}`,
    project: "Project",
    undisclosedClient: "Undisclosed client",
    projectPage: "See project page",
    // Luxon format of a project's start and end months
    projectMonthFormat: "LLLL yyyy",
    projectPeriod: (start: string, end?: string) => (end ? `From ${start} to ${end}` : `From ${start}`),
  },
  meeting: {
    heading: "Book a meeting with our team",
    bookedHeading: "Your meeting is booked",
    // The text around the email the invitation goes to
    invitationBefore: "A calendar invitation is on its way to ",
    invitationAfter: ".",
    closedNote: `This conversation is now closed. To change the time or add details, contact our team. To keep chatting with ${assistantName}, start a new conversation below.`,
    // Without a contact link, which the note would otherwise point to
    closedNoteWithoutContact: `This conversation is now closed. To keep chatting with ${assistantName}, start a new conversation below.`,
    contact: "Contact our team",
    loadFailed: "We couldn't load meeting availability.",
    // Above the times once the one the visitor tried to book was taken meanwhile, or is now too soon to book
    slotUnavailable: "That time can no longer be booked. Please pick another time.",
    tryAgain: "Try again",
    noTimes: "There are no meeting times available right now.",
    getInTouch: "Get in touch and we'll find a time that works for you.",
    // Instead of getInTouch when there is no contact link
    checkBackLater: "Please check back later.",
    duration: (minutes: number) => `${minutes}-minute meetings`,
    loadingStatus: "Loading meeting availability…",
    loadedStatus: "Meeting times loaded.",
    noTimesStatus: "No meeting times are available right now.",
  },
  // Luxon formats of the days in the meeting picker
  slots: {
    dayFormat: "cccc d LLLL y",
    announcedDayFormat: "cccc d LLLL",
    targetDayFormat: "ccc d LLL",
    targetDayWithYearFormat: "ccc d LLL y",
    availableOn: (day: string) => `Available slots on ${day}`,
    // Followed by the day, in bold
    noneOn: "No time slots available for",
    nextAvailable: (day: string) => `Next available: ${day}`,
    noLaterDays: "There are no later available days.",
    lastAvailable: (day: string) => `Last available: ${day}`,
    timesOn: (count: number, day: string) => `${count} meeting ${count === 1 ? "time" : "times"} on ${day}`,
    noTimesOn: (day: string, nextDay?: string) =>
      nextDay ? `No meeting times on ${day}. Next available: ${nextDay}` : `No meeting times on ${day}. There are no later available days.`,
    // Added to the calendar's label of a day without meeting times
    dayWithoutTimes: ", no meeting times",
  },
  booking: {
    title: "Book a meeting",
    email: "Email",
    emailHint: "We'll send the calendar invitation here.",
    invalidEmail: "Invalid email address",
    name: "Name",
    phone: "Phone",
    topic: "Topic of the Meeting",
    pickTime: "Please pick a meeting time",
    // The text around the "contact our team" link, and the whole message when there is no contact link
    failedBefore: "We couldn't book your meeting. Please try again or ",
    failedLink: "contact our team",
    failedAfter: ".",
    failedWithoutContact: "We couldn't book your meeting. Please try again.",
    submit: "Book meeting",
    submitting: "Booking…",
  },
  // The handoff card: the business's booking page and its enquiry form
  handoff: {
    bookingHeading: "Book a time with our team",
    // The booking page's button when the business set no text of its own
    book: "Book a time",
    // host: the booking page's site, e.g. calendly.com
    bookingNote: (host: string) => `You'll choose a time and confirm your booking on ${host}.`,
    enquiryHeading: `Send an enquiry to ${businessName}`,
    // Offering the enquiry form as the alternative to booking, with the booking link or the meeting picker
    alternative: "Prefer to be contacted instead?",
    showForm: "Send an enquiry",
    sharedNote: `These details will be sent to ${businessName}. Review them and correct anything if needed.`,
    // Followed by the topic the assistant gave the enquiry, which goes with it
    subject: "Subject:",
    name: "Name",
    email: "Email",
    phone: "Phone",
    company: "Company",
    message: "What you'd like to discuss",
    submit: "Send enquiry",
    submitting: "Sending…",
    tryAgain: "Try again",
    sendingStatus: "Sending your enquiry…",
    sentHeading: "Enquiry sent",
    // The text around where the team replies, an email or a phone number in bold
    sentBefore: `Sent to ${businessName}. The team will get back to you at `,
    sentAfter: ".",
    // Without an email or phone number to name
    sent: `Sent to ${businessName}. The team will get back to you.`,
    closedNote: `This conversation is now closed. To add details, contact our team. To keep chatting with ${assistantName}, start a new conversation below.`,
    // Without a contact link, which the note would otherwise point to
    closedNoteWithoutContact: `This conversation is now closed. To keep chatting with ${assistantName}, start a new conversation below.`,
    // The text around the "contact our team" link, and the whole message when there is no contact link
    failedBefore: "We couldn't send your enquiry. Your details are still here: try again in a moment or ",
    failedAfter: ".",
    failedWithoutContact: "We couldn't send your enquiry. Your details are still here: try again in a moment.",
    contactLink: "contact our team",
    closedBefore: "This conversation is already closed, so the enquiry can't be sent from here. Please ",
    closedWithoutContact: `This conversation is already closed, so the enquiry can't be sent from here. Start a new conversation with ${assistantName} below.`,
    unavailableBefore: "Enquiries can't be sent from the chat right now. Please ",
    unavailableWithoutContact: "Enquiries can't be sent from the chat right now. Please try again later.",
    // The server couldn't be reached or answered unexpectedly, so the enquiry may or may not have been sent
    error: "We couldn't confirm your enquiry was sent. Check your connection and try again: it won't be sent twice.",
    invalid: "Some details weren't accepted. Check them and try again.",
    // The enquiry form's checks, as the agents API words them in English
    validation: DEFAULT_ENQUIRY_MESSAGES,
  },
  // Fixed text of the team member resume PDF, in the language the resume was requested in. English headings name the
  // structured sources by the installation's labels; other languages use generic words, as labels are English only
  resume: {
    // The PDF's title and, sanitized, its filename
    // Without the business's name before the onboarding wizard has run
    title: (name: string) => (businessName ? `${businessName} Resume for ${name}` : `Resume for ${name}`),
    // The page a visitor sees when they open too many resumes in a minute
    tooManyDownloads: "Too many resume downloads from your network right now. Please try again in a minute.",
    contact: "Contact",
    capabilities: (labels: SourceLabels) => labels.capabilities.plural,
    languages: "Languages",
    english: "English",
    spanish: "Spanish",
    summary: "Summary",
    // The team member's own highlights, named after capabilities only while they're on
    capabilityHighlights: (labels: SourceLabels, showsCapabilities: boolean) =>
      showsCapabilities ? `${labels.capabilities.singular} highlights` : "Highlights",
    experienceHighlights: "Experience Highlights",
    present: "Present",
    projectContributions: (labels: SourceLabels) =>
      businessName ? `${businessName} ${inSentence(labels.projects.singular)} contributions` : `${labels.projects.singular} contributions`,
    undisclosedClient: (labels: SourceLabels) => `Undisclosed ${inSentence(labels.clients.singular)}`,
    active: "Ongoing",
    // Luxon formats of a project's start and end months and of the day the PDF is made
    monthFormat: "LLLL yyyy",
    generatedOnFormat: "LLLL d, yyyy",
    generatedOn: (date: string) => `Generated on ${date}`,
  },
})

export type Messages = ReturnType<typeof en>
