import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import { ClientMapper } from '@/apollo/schema/clients/mappers';
import { TeamMemberMapper } from '@/apollo/schema/teamMembers/mappers';
import { ProjectMapper } from '@/apollo/schema/projects/mappers';
import { ThreadMapper } from '@/apollo/schema/threads/mappers';
import { Context } from '@/apollo/types';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  JSON: { input: unknown; output: unknown; }
};

/** An email and password admin account, on an installation whose web app signs admins in itself (ADMIN_AUTH_PROVIDER=local) */
export type AdminAccount = {
  __typename?: 'AdminAccount';
  createdAt: Scalars['String']['output'];
  /** Trimmed and lowercase */
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  lastSignInAt?: Maybe<Scalars['String']['output']>;
  /** Set for a temporary password: the admin must choose a new one before using the admin */
  mustChangePassword: Scalars['Boolean']['output'];
  name?: Maybe<Scalars['String']['output']>;
  /** When the password was last set (changed, reset or created). Sessions signed in before it no longer grant access */
  passwordChangedAt: Scalars['String']['output'];
};

/** Token usage of one model call the admin made, as the AI SDK reports it */
export type AdminUsageInput = {
  /** Email of the admin who made the call */
  adminEmail: Scalars['String']['input'];
  /** Input tokens written to the prompt cache. 0 when omitted */
  cacheWriteTokens?: InputMaybe<Scalars['Int']['input']>;
  /** Input tokens read from the prompt cache. 0 when omitted */
  cachedInputTokens?: InputMaybe<Scalars['Int']['input']>;
  /** Input tokens, including cached and cache write tokens */
  inputTokens: Scalars['Int']['input'];
  /** The model called, e.g. gpt-6.1-sol */
  model: Scalars['String']['input'];
  /** Output tokens, including reasoning tokens */
  outputTokens: Scalars['Int']['input'];
  /** What the call was for, as its Langfuse trace name: translate-record (record translation) or improve-text (the Markdown editor's writing assistant) */
  purpose: Scalars['String']['input'];
  /** 0 when omitted */
  reasoningTokens?: InputMaybe<Scalars['Int']['input']>;
};

export type AllowedTime = {
  __typename?: 'AllowedTime';
  hour: Scalars['Int']['output'];
  minutes: Scalars['Int']['output'];
};

export type AllowedTimeInput = {
  hour: Scalars['Int']['input'];
  minutes: Scalars['Int']['input'];
};

/** An API key an admin generated for another system, such as a website. Its secret is never returned after it was created */
export type ApiKey = {
  __typename?: 'ApiKey';
  access: ApiKeyAccess;
  createdAt: Scalars['String']['output'];
  /** Email of the admin who created it, when known */
  createdBy?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  /** The secret's last 4 characters, to tell keys apart */
  lastCharacters: Scalars['String']['output'];
  /** When it was last used, recorded at most about once a minute; null until first used */
  lastUsedAt?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
};

/** What a generated API key may do. Neither may manage API keys or administrators */
export enum ApiKeyAccess {
  /** Every query and mutation the admin interface uses, but managing API keys or administrators (or setting the installation up). Can render PDFs, without running their scripts */
  Admin = 'ADMIN',
  /** Published records and public business data: no mutations, no admin-only queries or staff-only fields, includeUnpublished refused, draft and outdated translations left out. Can render PDFs, without running their scripts */
  ReadOnly = 'READ_ONLY'
}

export type Availability = {
  __typename?: 'Availability';
  slots?: Maybe<Array<Maybe<Slot>>>;
};

/** Where visitors book a meeting */
export type BookingSetting = {
  __typename?: 'BookingSetting';
  /** The booking button's text, for link. Null uses the chat's own */
  label?: Maybe<Scalars['String']['output']>;
  /** none, link (an external booking page) or calendar (the in-chat Google Calendar picker, see Appointment Settings) */
  type: Scalars['String']['output'];
  /** The booking page, for link */
  url?: Maybe<Scalars['String']['output']>;
};

export type BookingSettingInput = {
  label?: InputMaybe<Scalars['String']['input']>;
  type: Scalars['String']['input'];
  url?: InputMaybe<Scalars['String']['input']>;
};

/** Every business setting as entered, for the onboarding wizard and the admin settings. Null fields are unset, so their default applies. Includes the server-only agent fields: admins only */
export type BusinessSettings = {
  __typename?: 'BusinessSettings';
  /** Server-only: what the business provides, in the agent's instructions */
  agentDescription?: Maybe<Scalars['String']['output']>;
  /** Server-only: extra instructions for every conversation */
  agentGuidance?: Maybe<Scalars['String']['output']>;
  assistantName?: Maybe<Scalars['String']['output']>;
  avatarUrl?: Maybe<Scalars['String']['output']>;
  businessName: Scalars['String']['output'];
  careersUrl?: Maybe<Scalars['String']['output']>;
  contactEmail?: Maybe<Scalars['String']['output']>;
  contactPhone?: Maybe<Scalars['String']['output']>;
  contactUrl?: Maybe<Scalars['String']['output']>;
  defaultLanguage?: Maybe<Scalars['String']['output']>;
  /** The assistant's first message by language: the default language's is always there, the others fall back to it. Null uses the built-in greeting */
  greeting?: Maybe<Array<LocalizedText>>;
  logoUrl?: Maybe<Scalars['String']['output']>;
  /** Lowercase #rrggbb */
  primaryColor?: Maybe<Scalars['String']['output']>;
  /** Null shows the chat's built-in starters, an empty list none */
  starters?: Maybe<Array<BusinessStarter>>;
  updatedAt: Scalars['String']['output'];
  websiteUrl?: Maybe<Scalars['String']['output']>;
};

/** Every setting: those left null or empty are unset (cleared on an update). An invalid input fails with BAD_USER_INPUT and extensions.problems, a list of { field, message } such as starters.1.label.es or greeting.en */
export type BusinessSettingsInput = {
  agentDescription?: InputMaybe<Scalars['String']['input']>;
  agentGuidance?: InputMaybe<Scalars['String']['input']>;
  assistantName?: InputMaybe<Scalars['String']['input']>;
  avatarUrl?: InputMaybe<Scalars['String']['input']>;
  businessName: Scalars['String']['input'];
  careersUrl?: InputMaybe<Scalars['String']['input']>;
  contactEmail?: InputMaybe<Scalars['String']['input']>;
  contactPhone?: InputMaybe<Scalars['String']['input']>;
  contactUrl?: InputMaybe<Scalars['String']['input']>;
  defaultLanguage?: InputMaybe<Scalars['String']['input']>;
  /** Null or no text keeps the built-in greeting */
  greeting?: InputMaybe<Array<LocalizedTextInput>>;
  logoUrl?: InputMaybe<Scalars['String']['input']>;
  primaryColor?: InputMaybe<Scalars['String']['input']>;
  starters?: InputMaybe<Array<BusinessStarterInput>>;
  websiteUrl?: InputMaybe<Scalars['String']['input']>;
};

/** A suggested first message the chat offers before the conversation starts, as the business set it */
export type BusinessStarter = {
  __typename?: 'BusinessStarter';
  /** One of the starter icons in @lumi/shared-contracts/business, or null for none */
  icon?: Maybe<Scalars['String']['output']>;
  /** The text by language: the default language's is always there, the others fall back to it */
  label: Array<LocalizedText>;
  /** Sent as the visitor's first message */
  message: Array<LocalizedText>;
};

export type BusinessStarterInput = {
  icon?: InputMaybe<Scalars['String']['input']>;
  label: Array<LocalizedTextInput>;
  message: Array<LocalizedTextInput>;
};

export type Calendar = {
  __typename?: 'Calendar';
  allowedDays: Array<Scalars['Int']['output']>;
  allowedTimes: Array<AllowedTime>;
  availability?: Maybe<Availability>;
  bookingEmail: Scalars['String']['output'];
  calendars: Array<Scalars['String']['output']>;
  hostTimezone: Scalars['String']['output'];
  maxDaysOut: Scalars['Int']['output'];
  meetingDurationMins: Scalars['Int']['output'];
  minAvailableTimeBeforeSlot: Scalars['Int']['output'];
  sameDayMinHours: Scalars['Int']['output'];
};


export type CalendarAvailabilityArgs = {
  endDate?: InputMaybe<Scalars['Int']['input']>;
  startDate?: InputMaybe<Scalars['Int']['input']>;
};

export type CalendarInput = {
  allowedDays?: InputMaybe<Array<Scalars['Int']['input']>>;
  allowedTimes?: InputMaybe<Array<AllowedTimeInput>>;
  bookingEmail?: InputMaybe<Scalars['String']['input']>;
  calendars?: InputMaybe<Array<Scalars['String']['input']>>;
  hostTimezone?: InputMaybe<Scalars['String']['input']>;
  maxDaysOut?: InputMaybe<Scalars['Int']['input']>;
  meetingDurationMins?: InputMaybe<Scalars['Int']['input']>;
  minAvailableTimeBeforeSlot?: InputMaybe<Scalars['Int']['input']>;
  sameDayMinHours?: InputMaybe<Scalars['Int']['input']>;
};

export type Capability = {
  __typename?: 'Capability';
  description?: Maybe<Scalars['String']['output']>;
  /** Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language */
  fallback_fields: Array<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  /** Language the content was returned in: the requested one, or English when the capability has no translation in it or an outdated one */
  language: Scalars['String']['output'];
  name: Scalars['String']['output'];
  /** The capability's content in every language it has, English first */
  translations: Array<CapabilityTranslation>;
};

export type CapabilityInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
};

/** A capability's content in one language, as saved. A null field is not translated in it and reads in English */
export type CapabilityTranslation = {
  __typename?: 'CapabilityTranslation';
  description?: Maybe<Scalars['String']['output']>;
  /** An AI translation saved for review: reads skip it and return English until the team saves the translation. Always false in English */
  draft: Scalars['Boolean']['output'];
  language: Scalars['String']['output'];
  name?: Maybe<Scalars['String']['output']>;
  /** English changed since this translation was saved, so it may need reviewing. Always false in English */
  outdated: Scalars['Boolean']['output'];
  /** When the content was last saved in this language */
  updated_at: Scalars['String']['output'];
};

export type Client = {
  __typename?: 'Client';
  client_website?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  /** Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language */
  fallback_fields: Array<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  internal_webpage?: Maybe<Scalars['String']['output']>;
  /** Language the content was returned in: the requested one, or English when the client has no translation in it or an outdated one */
  language: Scalars['String']['output'];
  logo_key?: Maybe<Scalars['ID']['output']>;
  name: Scalars['String']['output'];
  /** The client's published projects; includeUnpublished adds unpublished ones */
  projects?: Maybe<Array<Maybe<Project>>>;
  /** Approved for external disclosure */
  published: Scalars['Boolean']['output'];
  summary: Scalars['String']['output'];
  /** The client's content in every language it has, English first */
  translations: Array<ClientTranslation>;
  url_slug: Scalars['String']['output'];
};


export type ClientProjectsArgs = {
  includeUnpublished?: InputMaybe<Scalars['Boolean']['input']>;
};

export type ClientInput = {
  client_website?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  internal_webpage?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  published?: InputMaybe<Scalars['Boolean']['input']>;
  summary: Scalars['String']['input'];
  url_slug: Scalars['String']['input'];
};

/** A client's content in one language, as saved. A null field is not translated in it and reads in English */
export type ClientTranslation = {
  __typename?: 'ClientTranslation';
  description?: Maybe<Scalars['String']['output']>;
  /** An AI translation saved for review: reads skip it and return English until the team saves the translation. Always false in English */
  draft: Scalars['Boolean']['output'];
  language: Scalars['String']['output'];
  /** English changed since this translation was saved, so it may need reviewing. Always false in English */
  outdated: Scalars['Boolean']['output'];
  summary?: Maybe<Scalars['String']['output']>;
  /** When the content was last saved in this language */
  updated_at: Scalars['String']['output'];
};

export type Company = {
  __typename?: 'Company';
  email: Scalars['String']['output'];
  /** Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language */
  fallback_fields: Array<Scalars['String']['output']>;
  founding_story?: Maybe<Scalars['String']['output']>;
  /** Language the content was returned in: the requested one, or English when the company has no translation in it or an outdated one */
  language: Scalars['String']['output'];
  location: Scalars['String']['output'];
  mission?: Maybe<Scalars['String']['output']>;
  phone: Scalars['String']['output'];
  /** The company's content in every language it has, English first */
  translations: Array<CompanyTranslation>;
  values?: Maybe<Scalars['String']['output']>;
  vision?: Maybe<Scalars['String']['output']>;
  webpage?: Maybe<Scalars['String']['output']>;
};

export type CompanyInput = {
  email: Scalars['String']['input'];
  founding_story?: InputMaybe<Scalars['String']['input']>;
  location: Scalars['String']['input'];
  mission?: InputMaybe<Scalars['String']['input']>;
  phone: Scalars['String']['input'];
  values?: InputMaybe<Scalars['String']['input']>;
  vision?: InputMaybe<Scalars['String']['input']>;
  webpage?: InputMaybe<Scalars['String']['input']>;
};

/** The company's content in one language, as saved. A null field is not translated in it and reads in English */
export type CompanyTranslation = {
  __typename?: 'CompanyTranslation';
  /** An AI translation saved for review: reads skip it and return English until the team saves the translation. Always false in English */
  draft: Scalars['Boolean']['output'];
  founding_story?: Maybe<Scalars['String']['output']>;
  language: Scalars['String']['output'];
  mission?: Maybe<Scalars['String']['output']>;
  /** English changed since this translation was saved, so it may need reviewing. Always false in English */
  outdated: Scalars['Boolean']['output'];
  /** When the content was last saved in this language */
  updated_at: Scalars['String']['output'];
  values?: Maybe<Scalars['String']['output']>;
  vision?: Maybe<Scalars['String']['output']>;
};

export type CreateUploadResponse = {
  __typename?: 'CreateUploadResponse';
  key: Scalars['String']['output'];
  signedUrl: Scalars['String']['output'];
};

export type CreatedAdminAccount = {
  __typename?: 'CreatedAdminAccount';
  account: AdminAccount;
  /** Shown once, never stored in plain text */
  temporaryPassword: Scalars['String']['output'];
};

export type CreatedApiKey = {
  __typename?: 'CreatedApiKey';
  apiKey: ApiKey;
  /** The key itself, shown once: only its hash is stored */
  secret: Scalars['String']['output'];
};

export type Dashboard = {
  __typename?: 'Dashboard';
  /** One entry per day of the range, oldest first, including the days without activity */
  activity: Array<DashboardDay>;
  content: DashboardContent;
  /** Total cost in USD of the conversations started in the range, their calls made since included. Null when one of them has calls without a price */
  conversationsCost?: Maybe<Scalars['Float']['output']>;
  mcp: DashboardMcp;
  /** Latest conversations of the range that left an email or a phone number, newest first */
  recentLeads: Array<Thread>;
  /** IANA time zone the days are counted in */
  timeZone: Scalars['String']['output'];
  /** Token usage and cost of the range's model calls per purpose and model, most expensive first: the conversations' and the admin's own (record translation and the editor's writing assistant) */
  usage: Array<ModelUsage>;
  websites: Array<DashboardWebsite>;
};

export type DashboardContent = {
  __typename?: 'DashboardContent';
  capabilities: Scalars['Int']['output'];
  clients: PublishedCount;
  jobOpenings: PublishedCount;
  projects: PublishedCount;
  teamMembers: PublishedCount;
};

export type DashboardDay = {
  __typename?: 'DashboardDay';
  /** Conversations started that day */
  conversations: Scalars['Int']['output'];
  /** Cost in USD of that day's priced model calls, the conversations' and the admin's own */
  cost: Scalars['Float']['output'];
  /** Day in the dashboard time zone, as YYYY-MM-DD */
  date: Scalars['String']['output'];
  /** Conversations started that day that left an email or a phone number */
  leads: Scalars['Int']['output'];
  /** Conversations started that day that booked a meeting */
  meetings: Scalars['Int']['output'];
  /** Model calls of that day without a price, the conversations' and the admin's own: while there are any, the cost is incomplete */
  unpricedCalls: Scalars['Int']['output'];
};

export type DashboardMcp = {
  __typename?: 'DashboardMcp';
  /** MCP writes of the range */
  calls: Scalars['Int']['output'];
  /** MCP writes of the range that failed */
  errors: Scalars['Int']['output'];
  /** Latest MCP writes of the range, newest first */
  recent: Array<McpAuditEvent>;
};

export type DashboardWebsite = {
  __typename?: 'DashboardWebsite';
  id: Scalars['ID']['output'];
  /** When the website was last crawled. Null when it was never crawled */
  lastProcessed?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  /** Pages Lumi can search: those processed by a crawl, including pages since removed from the sitemap */
  pages: Scalars['Int']['output'];
  url: Scalars['String']['output'];
};

/** A delivery channel that sends each enquiry to the team, as admins see it: the webhook secret is never returned */
export type DeliveryChannel = {
  __typename?: 'DeliveryChannel';
  /** For webhook: whether a signing secret is saved */
  hasSecret: Scalars['Boolean']['output'];
  /** Stays the same across edits, so an enquiry's deliveries are tracked per channel */
  key: Scalars['ID']['output'];
  /** For email */
  recipients?: Maybe<Array<Scalars['String']['output']>>;
  /** email or webhook */
  type: Scalars['String']['output'];
  /** For webhook */
  url?: Maybe<Scalars['String']['output']>;
};

/** A channel as admins send it. A new channel has no key. A webhook without a secret keeps the secret saved for its key */
export type DeliveryChannelInput = {
  key?: InputMaybe<Scalars['ID']['input']>;
  recipients?: InputMaybe<Array<Scalars['String']['input']>>;
  secret?: InputMaybe<Scalars['String']['input']>;
  type: Scalars['String']['input'];
  url?: InputMaybe<Scalars['String']['input']>;
};

export type Document = {
  __typename?: 'Document';
  metadata: Scalars['JSON']['output'];
  pageContent: Scalars['String']['output'];
};

/** An enquiry a visitor sent from a conversation, with the contact fields the form asked for */
export type Enquiry = {
  __typename?: 'Enquiry';
  contact: Array<EnquiryContactValue>;
  createdAt: Scalars['String']['output'];
  deliveries: Array<EnquiryDelivery>;
  id: Scalars['ID']['output'];
  message?: Maybe<Scalars['String']['output']>;
  qualification: Array<EnquiryAnswer>;
  /** pending, delivered (every channel tried accepted it), partial (some did) or failed (none did) */
  status: Scalars['String']['output'];
  /** Made by the visitor's form: resending the same submission never creates a second enquiry */
  submissionId: Scalars['ID']['output'];
  topic?: Maybe<Scalars['String']['output']>;
};

export type EnquiryAnswer = {
  __typename?: 'EnquiryAnswer';
  /** Empty when the visitor left it out */
  answer: Scalars['String']['output'];
  question: Scalars['String']['output'];
};

export type EnquiryContactValue = {
  __typename?: 'EnquiryContactValue';
  /** name, email, phone or company */
  field: Scalars['String']['output'];
  value: Scalars['String']['output'];
};

/** One channel's delivery of an enquiry */
export type EnquiryDelivery = {
  __typename?: 'EnquiryDelivery';
  attempts: Scalars['Int']['output'];
  channelKey: Scalars['ID']['output'];
  /** email or webhook */
  channelType: Scalars['String']['output'];
  deliveredAt?: Maybe<Scalars['String']['output']>;
  /** Where the channel sends to now (the recipients or the webhook's host), or null when the channel was removed */
  destination?: Maybe<Scalars['String']['output']>;
  /** Why the latest attempt failed */
  lastError?: Maybe<Scalars['String']['output']>;
  /** pending, delivered or failed */
  status: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
};

/** How the enquiry form treats one contact field */
export type EnquiryFieldSetting = {
  __typename?: 'EnquiryFieldSetting';
  /** name, email, phone or company */
  field: Scalars['String']['output'];
  /** off, optional or required */
  mode: Scalars['String']['output'];
};

export type EnquiryFieldSettingInput = {
  field: Scalars['String']['input'];
  mode: Scalars['String']['input'];
};

export type EventInput = {
  conversationUrl: Scalars['String']['input'];
  email: Scalars['String']['input'];
  end: Scalars['Int']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
  start: Scalars['Int']['input'];
  summary?: InputMaybe<Scalars['String']['input']>;
  topic?: InputMaybe<Scalars['String']['input']>;
};

export type Experience = {
  __typename?: 'Experience';
  company: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  end_date?: Maybe<Scalars['String']['output']>;
  /** Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language */
  fallback_fields: Array<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  /** Language the content was returned in: the requested one, or English when the experience has no translation in it or an outdated one */
  language: Scalars['String']['output'];
  location: Scalars['String']['output'];
  logo_key?: Maybe<Scalars['ID']['output']>;
  position: Scalars['String']['output'];
  start_date: Scalars['String']['output'];
  /** The experience's content in every language it has, English first */
  translations: Array<ExperienceTranslation>;
};

export type ExperienceInput = {
  company: Scalars['String']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  end_date?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
  location: Scalars['String']['input'];
  position: Scalars['String']['input'];
  start_date: Scalars['String']['input'];
};

/** A work experience's content in one language, as saved. A null field is not translated in it and reads in English */
export type ExperienceTranslation = {
  __typename?: 'ExperienceTranslation';
  description?: Maybe<Scalars['String']['output']>;
  /** An AI translation saved for review: reads skip it and return English until the team saves the translation. Always false in English */
  draft: Scalars['Boolean']['output'];
  language: Scalars['String']['output'];
  /** English changed since this translation was saved, so it may need reviewing. Always false in English */
  outdated: Scalars['Boolean']['output'];
  position?: Maybe<Scalars['String']['output']>;
  /** When the content was last saved in this language */
  updated_at: Scalars['String']['output'];
};

/** The installation's first admin, created by the onboarding wizard. An invalid one fails with BAD_USER_INPUT and extensions.problems for firstAdmin.email, firstAdmin.name or firstAdmin.password */
export type FirstAdminInput = {
  email: Scalars['String']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  /** At least 12 characters, at most 256 */
  password: Scalars['String']['input'];
};

export type GetUploadResponse = {
  __typename?: 'GetUploadResponse';
  contentType?: Maybe<Scalars['String']['output']>;
  signedUrl: Scalars['String']['output'];
};

/** The qualification and handoff settings, with the delivery channels redacted. Admins only */
export type HandoffSettings = {
  __typename?: 'HandoffSettings';
  /** The channel types this server can deliver with: email only when its sender is configured (EMAIL_FROM) */
  availableChannelTypes: Array<Scalars['String']['output']>;
  booking: BookingSetting;
  channels: Array<DeliveryChannel>;
  /** Whether visitors can send an enquiry from the chat. Enquiries are offered only while at least one channel is set up */
  enquiryEnabled: Scalars['Boolean']['output'];
  /** Every enquiry field, in the order the form shows them */
  enquiryFields: Array<EnquiryFieldSetting>;
  /** Asked naturally during conversations before the handoff is suggested; the answers go with the enquiry */
  qualificationQuestions: Array<Scalars['String']['output']>;
  /** Null until the settings are first saved, while the defaults apply */
  updatedAt?: Maybe<Scalars['String']['output']>;
};

/** Every setting. Null takes the default. An invalid input fails with BAD_USER_INPUT and extensions.problems, a list of { field, message } such as channels.1.url */
export type HandoffSettingsInput = {
  booking?: InputMaybe<BookingSettingInput>;
  channels?: InputMaybe<Array<DeliveryChannelInput>>;
  enquiryEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  enquiryFields?: InputMaybe<Array<EnquiryFieldSettingInput>>;
  qualificationQuestions?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type JobOpening = {
  __typename?: 'JobOpening';
  /** Where candidates apply for this opening; without one, candidates are pointed to the careers page from the business settings */
  application_url?: Maybe<Scalars['String']['output']>;
  created_at: Scalars['String']['output'];
  /** The full description of the role (markdown) */
  description?: Maybe<Scalars['String']['output']>;
  /** Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language */
  fallback_fields: Array<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  /** Language the content was returned in: the requested one, or English when the job opening has no translation in it or an outdated one */
  language: Scalars['String']['output'];
  /** Where the work is based, e.g. Madrid, Spain. Shared by every language */
  location: Scalars['String']['output'];
  /** When the opening was posted, as an ISO 8601 date */
  posted_at: Scalars['String']['output'];
  /** Approved for external disclosure */
  published: Scalars['Boolean']['output'];
  /** One or two sentences about the role */
  summary: Scalars['String']['output'];
  title: Scalars['String']['output'];
  /** The job opening's content in every language it has, English first */
  translations: Array<JobOpeningTranslation>;
  updated_at: Scalars['String']['output'];
  url_slug: Scalars['String']['output'];
  /** REMOTE, HYBRID or ONSITE */
  work_mode: Scalars['String']['output'];
};

export type JobOpeningInput = {
  application_url?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  location: Scalars['String']['input'];
  /** ISO 8601 date */
  posted_at: Scalars['String']['input'];
  published?: InputMaybe<Scalars['Boolean']['input']>;
  summary: Scalars['String']['input'];
  title: Scalars['String']['input'];
  url_slug: Scalars['String']['input'];
  /** REMOTE, HYBRID or ONSITE */
  work_mode: Scalars['String']['input'];
};

/** A job opening's content in one language, as saved. A null field is not translated in it and reads in English */
export type JobOpeningTranslation = {
  __typename?: 'JobOpeningTranslation';
  description?: Maybe<Scalars['String']['output']>;
  /** An AI translation saved for review: reads skip it and return English until the team saves the translation. Always false in English */
  draft: Scalars['Boolean']['output'];
  language: Scalars['String']['output'];
  /** English changed since this translation was saved, so it may need reviewing. Always false in English */
  outdated: Scalars['Boolean']['output'];
  summary?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  /** When the content was last saved in this language */
  updated_at: Scalars['String']['output'];
};

/** The structured sources the chat, the MCP server and the admin navigation use, and their labels */
export type KnowledgeSources = {
  __typename?: 'KnowledgeSources';
  capabilities: Scalars['Boolean']['output'];
  clients: Scalars['Boolean']['output'];
  jobOpenings: Scalars['Boolean']['output'];
  labels: SourceLabels;
  projects: Scalars['Boolean']['output'];
  /** False until an admin saves them: until then a structured source is on when it has a published record, and capabilities when one is linked to a published team member or project while team members or projects are on */
  saved: Scalars['Boolean']['output'];
  teamMembers: Scalars['Boolean']['output'];
};

/** Text in one language */
export type LocalizedText = {
  __typename?: 'LocalizedText';
  language: Scalars['String']['output'];
  text: Scalars['String']['output'];
};

export type LocalizedTextInput = {
  language: Scalars['String']['input'];
  text: Scalars['String']['input'];
};

export type LumiRelease = {
  __typename?: 'LumiRelease';
  /** When the release was published, as an ISO 8601 timestamp */
  publishedAt: Scalars['String']['output'];
  /** The release's page on GitHub, with its notes */
  url: Scalars['String']['output'];
  /** The release's version, such as 0.63.0 */
  version: Scalars['String']['output'];
};

export type LumiVersion = {
  __typename?: 'LumiVersion';
  /** Whether the latest release could be checked: OFF when LUMI_UPDATE_CHECK turns the check off, UNAVAILABLE when GitHub couldn't be reached */
  check: UpdateCheck;
  /** The version the backend image was built from, such as 0.62.0. local or unknown for a build without a release version */
  current: Scalars['String']['output'];
  /** The latest published release. Null unless check is OK */
  latest?: Maybe<LumiRelease>;
  /** Whether latest is a newer release than current. False when the check isn't OK or current isn't a release version */
  updateAvailable: Scalars['Boolean']['output'];
};

export type McpAuditEvent = {
  __typename?: 'McpAuditEvent';
  actorEmail: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  /** success or the error code */
  outcome: Scalars['String']['output'];
  recordId?: Maybe<Scalars['String']['output']>;
  recordType?: Maybe<Scalars['String']['output']>;
  tool: Scalars['String']['output'];
};

export type ModelUsage = {
  __typename?: 'ModelUsage';
  /** Whether these are the admin's own calls rather than a conversation's */
  adminCalls: Scalars['Boolean']['output'];
  /** Input tokens written to the prompt cache, billed at the cache write rate */
  cacheWriteTokens: Scalars['Int']['output'];
  /** Input tokens read from the prompt cache, billed at the cached rate */
  cachedInputTokens: Scalars['Int']['output'];
  /** Number of model calls */
  calls: Scalars['Int']['output'];
  /** Cost in USD. Null when a call has no price and the cost would be incomplete */
  cost?: Maybe<Scalars['Float']['output']>;
  /** Input tokens, including cached and cache write tokens */
  inputTokens: Scalars['Int']['output'];
  model: Scalars['String']['output'];
  /** Output tokens, including reasoning tokens */
  outputTokens: Scalars['Int']['output'];
  /** What the calls were for: chat (agent replies and tool calls), extraction (conversation state and meeting data), query (website search queries), writing (summaries), embedding (website search embeddings) or other. On the dashboard also the admin's own calls: translate-record (record translation), improve-text (the editor's writing assistant) and crawl-website (the embeddings of the website crawls an admin starts) */
  purpose: Scalars['String']['output'];
  reasoningTokens: Scalars['Int']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  addCapabilitiesToProject?: Maybe<Scalars['Boolean']['output']>;
  addCapabilitiesToTeamMember?: Maybe<Scalars['Boolean']['output']>;
  addEvent?: Maybe<Scalars['Boolean']['output']>;
  /** Creates the experiences in English */
  addExperiencesToTeamMember?: Maybe<Array<Maybe<Scalars['ID']['output']>>>;
  addTeamMembersToProject?: Maybe<Scalars['Boolean']['output']>;
  /** Checks the current password, sets the new one and clears mustChangePassword. Fails with INVALID_CREDENTIALS, BAD_USER_INPUT (policy, or same as current; extensions.problems for newPassword), RATE_LIMITED (failures count like sign-ins) or NOT_FOUND (account removed) */
  changeAdminPassword: AdminAccount;
  /** Deletes the website's pages and their search content. Fails while the website is being crawled */
  clearProcessedWebsitePages?: Maybe<Scalars['Boolean']['output']>;
  /** Adds an admin with a generated temporary password. Fails with BAD_USER_INPUT or ADMIN_EXISTS (email taken). Admins only */
  createAdminAccount: CreatedAdminAccount;
  /** Generates an API key. Only with the installation's internal API key */
  createApiKey: CreatedApiKey;
  /** Creates the capability in English */
  createCapability?: Maybe<Scalars['ID']['output']>;
  /** Creates the client in English */
  createClient?: Maybe<Scalars['ID']['output']>;
  /** Creates the job opening in English */
  createJobOpening?: Maybe<Scalars['ID']['output']>;
  /** Creates the project in English */
  createProject?: Maybe<Scalars['ID']['output']>;
  /** Creates the team member in English */
  createTeamMember?: Maybe<Scalars['ID']['output']>;
  createThread: Scalars['ID']['output'];
  createUpload: CreateUploadResponse;
  /** The URL must be a public http(s) address: private, local and reserved network addresses are refused (BAD_USER_INPUT) */
  createWebsite?: Maybe<Scalars['ID']['output']>;
  /** Fails with NOT_FOUND or LAST_ADMIN (atomic: never leaves zero accounts). Admins only */
  deleteAdminAccount: Scalars['Boolean']['output'];
  deleteCapability?: Maybe<Scalars['Boolean']['output']>;
  deleteClient?: Maybe<Scalars['Boolean']['output']>;
  deleteJobOpening?: Maybe<Scalars['Boolean']['output']>;
  deleteProject?: Maybe<Scalars['Boolean']['output']>;
  deleteTeamMember?: Maybe<Scalars['Boolean']['output']>;
  deleteThread: Scalars['Boolean']['output'];
  deleteWebsite?: Maybe<Scalars['Boolean']['output']>;
  linkUploadToClientLogo?: Maybe<Scalars['Boolean']['output']>;
  linkUploadToExperienceLogo?: Maybe<Scalars['Boolean']['output']>;
  linkUploadToProjectImage?: Maybe<Scalars['Boolean']['output']>;
  linkUploadToTeamMemberPhoto?: Maybe<Scalars['Boolean']['output']>;
  /** Records the usage of one of the admin's model calls, costed at the model's prices (without a cost when the model has no price), for the dashboard. False when it could not be saved, which is logged rather than thrown */
  recordAdminUsage: Scalars['Boolean']['output'];
  removeExperiences?: Maybe<Scalars['Boolean']['output']>;
  removeProjectCapabilities?: Maybe<Scalars['Boolean']['output']>;
  removeTeamMemberCapabilities?: Maybe<Scalars['Boolean']['output']>;
  removeTeamMembersFromProject?: Maybe<Scalars['Boolean']['output']>;
  /** Sends the enquiry again through each current channel that hasn't delivered it (every current channel when none has), and returns it with the new delivery states. Admins only */
  retryEnquiryDelivery: Enquiry;
  /** Revokes the key: it is refused from then on (on AWS, within the authorizer's cache time). Fails with NOT_FOUND when it doesn't exist or was already revoked. Only with the installation's internal API key */
  revokeApiKey: Scalars['Boolean']['output'];
  /** Saves AI translations into the language as drafts for the team to review: reads skip a draft and return English until the team saves the translation. Each item is saved only when it has no translation in the language yet, so one saved meanwhile is never replaced, or with replaceOutdated, also when its translation is outdated */
  saveTranslationDrafts: TranslationDraftsResult;
  /** Sets the installation up from the onboarding wizard: saves the business settings when none exist yet, and with firstAdmin creates that admin account in the same transaction. Fails with ALREADY_SET_UP once set up, ADMIN_EXISTS (nothing saved) when firstAdmin is given but an admin account exists, or BAD_USER_INPUT listing the problems with the settings and firstAdmin */
  setupBusiness: BusinessSettings;
  /** Replaces every business setting. Fails with NOT_SET_UP before the setup, or BAD_USER_INPUT. Admins only */
  updateBusinessSettings: BusinessSettings;
  /** Saves the capability's content in the language, English by default. Other languages leave English as it is */
  updateCapability?: Maybe<Scalars['Boolean']['output']>;
  /** Saves the client's content in the language, English by default. English also saves its shared fields; other languages leave English and the shared fields as they are */
  updateClient?: Maybe<Scalars['Boolean']['output']>;
  /** Saves the company's content in the language, English by default. English also saves its shared fields; other languages need English saved first and leave English and the shared fields as they are */
  updateCompany?: Maybe<Scalars['Boolean']['output']>;
  /** Saves the experiences' content in the language, English by default. English also saves their shared fields; other languages leave English and the shared fields as they are */
  updateExperiences?: Maybe<Scalars['Boolean']['output']>;
  /** Replaces every handoff setting. Fails with BAD_USER_INPUT listing the problems. Admins only */
  updateHandoffSettings: HandoffSettings;
  /** Saves the job opening's content in the language, English by default. English also saves its shared fields; other languages leave English and the shared fields as they are */
  updateJobOpening?: Maybe<Scalars['Boolean']['output']>;
  /** Saves the project's content in the language, English by default. English also saves its shared fields; other languages leave English and the shared fields as they are */
  updateProject?: Maybe<Scalars['Boolean']['output']>;
  /** Saves the contributions' descriptions in the language, English by default. English also saves their dates; other languages leave English and the dates as they are */
  updateProjectTeamMember?: Maybe<Scalars['Boolean']['output']>;
  /** Replaces every resume setting. Fails with BAD_USER_INPUT listing the problems. Admins only */
  updateResumeSettings: ResumeSettings;
  /** Replaces the structured sources and their labels. Invalid labels fail with BAD_USER_INPUT and extensions.problems, a list of { field, message } such as labels.teamMembers.plural */
  updateStructuredSources: KnowledgeSources;
  /** Saves the team member's content in the language, English by default. English also saves its shared fields; other languages leave English and the shared fields as they are */
  updateTeamMember?: Maybe<Scalars['Boolean']['output']>;
  updateTeamMemberCapabilities?: Maybe<Scalars['Boolean']['output']>;
  updateThread?: Maybe<Scalars['Boolean']['output']>;
  updateWebsite?: Maybe<Scalars['Boolean']['output']>;
  /** Starts crawling the website for new and modified pages. Fails while the website is being crawled or a crawl is starting */
  updateWebsitePages?: Maybe<Scalars['Boolean']['output']>;
  upsertAppointmentSettings?: Maybe<Scalars['Boolean']['output']>;
  /** Null for a wrong email/password or unknown email (same timing: hash a dummy password). Fails with RATE_LIMITED (extensions.retryAfterSeconds) when the email or IP is throttled: 10 failures per 15 minutes each. Records lastSignInAt on success */
  verifyAdminCredentials?: Maybe<AdminAccount>;
};


export type MutationAddCapabilitiesToProjectArgs = {
  capabilityIds: Array<Scalars['ID']['input']>;
  projectId: Scalars['ID']['input'];
};


export type MutationAddCapabilitiesToTeamMemberArgs = {
  input: Array<InputMaybe<TeamMemberCapabilityInput>>;
  teamMemberId: Scalars['ID']['input'];
};


export type MutationAddEventArgs = {
  input: EventInput;
  threadId: Scalars['ID']['input'];
};


export type MutationAddExperiencesToTeamMemberArgs = {
  input: Array<InputMaybe<ExperienceInput>>;
  teamMemberId: Scalars['ID']['input'];
};


export type MutationAddTeamMembersToProjectArgs = {
  projectId: Scalars['ID']['input'];
  teamMembers: Array<ProjectTeamMemberInput>;
};


export type MutationChangeAdminPasswordArgs = {
  currentPassword: Scalars['String']['input'];
  id: Scalars['ID']['input'];
  newPassword: Scalars['String']['input'];
};


export type MutationClearProcessedWebsitePagesArgs = {
  id: Scalars['ID']['input'];
};


export type MutationCreateAdminAccountArgs = {
  input: NewAdminAccountInput;
};


export type MutationCreateApiKeyArgs = {
  input: NewApiKeyInput;
};


export type MutationCreateCapabilityArgs = {
  input: CapabilityInput;
};


export type MutationCreateClientArgs = {
  input: ClientInput;
};


export type MutationCreateJobOpeningArgs = {
  input: JobOpeningInput;
};


export type MutationCreateProjectArgs = {
  input: ProjectInput;
};


export type MutationCreateTeamMemberArgs = {
  input: TeamMemberInput;
};


export type MutationCreateUploadArgs = {
  contentType: Scalars['String']['input'];
};


export type MutationCreateWebsiteArgs = {
  input: WebsiteInput;
};


export type MutationDeleteAdminAccountArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteCapabilityArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteClientArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteJobOpeningArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteProjectArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteTeamMemberArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteThreadArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteWebsiteArgs = {
  id: Scalars['ID']['input'];
};


export type MutationLinkUploadToClientLogoArgs = {
  clientId: Scalars['ID']['input'];
  key: Scalars['ID']['input'];
};


export type MutationLinkUploadToExperienceLogoArgs = {
  experienceId: Scalars['ID']['input'];
  key: Scalars['ID']['input'];
};


export type MutationLinkUploadToProjectImageArgs = {
  key: Scalars['ID']['input'];
  projectId: Scalars['ID']['input'];
};


export type MutationLinkUploadToTeamMemberPhotoArgs = {
  key: Scalars['ID']['input'];
  teamMemberId: Scalars['ID']['input'];
};


export type MutationRecordAdminUsageArgs = {
  input: AdminUsageInput;
};


export type MutationRemoveExperiencesArgs = {
  ids: Array<InputMaybe<Scalars['ID']['input']>>;
};


export type MutationRemoveProjectCapabilitiesArgs = {
  ids: Array<InputMaybe<Scalars['ID']['input']>>;
  projectId: Scalars['ID']['input'];
};


export type MutationRemoveTeamMemberCapabilitiesArgs = {
  ids: Array<InputMaybe<Scalars['ID']['input']>>;
  teamMemberId: Scalars['ID']['input'];
};


export type MutationRemoveTeamMembersFromProjectArgs = {
  projectId: Scalars['ID']['input'];
  teamMemberIds: Array<Scalars['ID']['input']>;
};


export type MutationRetryEnquiryDeliveryArgs = {
  id: Scalars['ID']['input'];
};


export type MutationRevokeApiKeyArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSaveTranslationDraftsArgs = {
  drafts: Array<TranslationDraftInput>;
  language: Scalars['String']['input'];
  replaceOutdated?: InputMaybe<Scalars['Boolean']['input']>;
};


export type MutationSetupBusinessArgs = {
  firstAdmin?: InputMaybe<FirstAdminInput>;
  input: BusinessSettingsInput;
};


export type MutationUpdateBusinessSettingsArgs = {
  input: BusinessSettingsInput;
};


export type MutationUpdateCapabilityArgs = {
  id: Scalars['ID']['input'];
  input: CapabilityInput;
  language?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateClientArgs = {
  id: Scalars['ID']['input'];
  input: ClientInput;
  language?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateCompanyArgs = {
  input: CompanyInput;
  language?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateExperiencesArgs = {
  input: Array<InputMaybe<ExperienceInput>>;
  language?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateHandoffSettingsArgs = {
  input: HandoffSettingsInput;
};


export type MutationUpdateJobOpeningArgs = {
  id: Scalars['ID']['input'];
  input: JobOpeningInput;
  language?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateProjectArgs = {
  id: Scalars['ID']['input'];
  input: ProjectInput;
  language?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateProjectTeamMemberArgs = {
  language?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
  teamMembers: Array<ProjectTeamMemberInput>;
};


export type MutationUpdateResumeSettingsArgs = {
  input: ResumeSettingsInput;
};


export type MutationUpdateStructuredSourcesArgs = {
  input: StructuredSourcesInput;
};


export type MutationUpdateTeamMemberArgs = {
  id: Scalars['ID']['input'];
  input: TeamMemberInput;
  language?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateTeamMemberCapabilitiesArgs = {
  input: Array<InputMaybe<TeamMemberCapabilityInput>>;
  teamMemberId: Scalars['ID']['input'];
};


export type MutationUpdateThreadArgs = {
  id: Scalars['ID']['input'];
  input: ThreadInput;
};


export type MutationUpdateWebsiteArgs = {
  id: Scalars['ID']['input'];
  input: WebsiteInput;
};


export type MutationUpdateWebsitePagesArgs = {
  adminEmail?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  kind?: InputMaybe<WebsiteCrawlKind>;
};


export type MutationUpsertAppointmentSettingsArgs = {
  data: CalendarInput;
};


export type MutationVerifyAdminCredentialsArgs = {
  clientIp?: InputMaybe<Scalars['String']['input']>;
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};

/** An admin added by another. An invalid one fails with BAD_USER_INPUT and extensions.problems for email or name */
export type NewAdminAccountInput = {
  email: Scalars['String']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
};

/** An invalid one fails with BAD_USER_INPUT and extensions.problems for name */
export type NewApiKeyInput = {
  access: ApiKeyAccess;
  /** Email of the admin creating it */
  createdBy?: InputMaybe<Scalars['String']['input']>;
  /** Trimmed; 1 to 100 characters */
  name: Scalars['String']['input'];
};

export type Project = {
  __typename?: 'Project';
  capabilities?: Maybe<Array<Maybe<Capability>>>;
  /** The project's client, or null when it is unpublished unless includeUnpublished */
  client?: Maybe<Client>;
  created_at: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  end_date?: Maybe<Scalars['String']['output']>;
  /** Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language */
  fallback_fields: Array<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  image_key?: Maybe<Scalars['ID']['output']>;
  industry?: Maybe<Scalars['String']['output']>;
  /** Language the content was returned in: the requested one, or English when the project has no translation in it or an outdated one */
  language: Scalars['String']['output'];
  location: Scalars['String']['output'];
  name: Scalars['String']['output'];
  /** Approved for external disclosure */
  published: Scalars['Boolean']['output'];
  start_date: Scalars['String']['output'];
  summary?: Maybe<Scalars['String']['output']>;
  /** Contributions of published team members; includeUnpublished adds those of unpublished ones, such as people who left the business */
  teamMembers?: Maybe<Array<Maybe<TeamMemberInProject>>>;
  /** The project's content in every language it has, English first */
  translations: Array<ProjectTranslation>;
  type?: Maybe<Scalars['String']['output']>;
  updated_at: Scalars['String']['output'];
  url_slug: Scalars['String']['output'];
  webpage?: Maybe<Scalars['String']['output']>;
};


export type ProjectClientArgs = {
  includeUnpublished?: InputMaybe<Scalars['Boolean']['input']>;
};


export type ProjectTeamMembersArgs = {
  includeUnpublished?: InputMaybe<Scalars['Boolean']['input']>;
};

export type ProjectContribution = {
  __typename?: 'ProjectContribution';
  description?: Maybe<Scalars['String']['output']>;
  end_date?: Maybe<Scalars['String']['output']>;
  /** Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language */
  fallback_fields: Array<Scalars['String']['output']>;
  /** Language the contribution's content was returned in: the requested one, or English when it has no translation in it or an outdated one */
  language: Scalars['String']['output'];
  project: Project;
  start_date: Scalars['String']['output'];
  /** The contribution's content in every language it has, English first */
  translations: Array<ProjectContributionTranslation>;
};

/** A team member's contribution to a project in one language, as saved. A null field is not translated in it and reads in English */
export type ProjectContributionTranslation = {
  __typename?: 'ProjectContributionTranslation';
  description?: Maybe<Scalars['String']['output']>;
  /** An AI translation saved for review: reads skip it and return English until the team saves the translation. Always false in English */
  draft: Scalars['Boolean']['output'];
  language: Scalars['String']['output'];
  /** English changed since this translation was saved, so it may need reviewing. Always false in English */
  outdated: Scalars['Boolean']['output'];
  /** When the content was last saved in this language */
  updated_at: Scalars['String']['output'];
};

export type ProjectInput = {
  client_id?: InputMaybe<Scalars['ID']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  end_date?: InputMaybe<Scalars['String']['input']>;
  industry?: InputMaybe<Scalars['String']['input']>;
  location: Scalars['String']['input'];
  name: Scalars['String']['input'];
  published?: InputMaybe<Scalars['Boolean']['input']>;
  start_date: Scalars['String']['input'];
  summary?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
  url_slug: Scalars['String']['input'];
  webpage?: InputMaybe<Scalars['String']['input']>;
};

export type ProjectTeamMemberInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  end_date?: InputMaybe<Scalars['String']['input']>;
  start_date: Scalars['String']['input'];
  team_member_id: Scalars['ID']['input'];
};

/** A project's content in one language, as saved. A null field is not translated in it and reads in English */
export type ProjectTranslation = {
  __typename?: 'ProjectTranslation';
  description?: Maybe<Scalars['String']['output']>;
  /** An AI translation saved for review: reads skip it and return English until the team saves the translation. Always false in English */
  draft: Scalars['Boolean']['output'];
  industry?: Maybe<Scalars['String']['output']>;
  language: Scalars['String']['output'];
  name?: Maybe<Scalars['String']['output']>;
  /** English changed since this translation was saved, so it may need reviewing. Always false in English */
  outdated: Scalars['Boolean']['output'];
  summary?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Scalars['String']['output']>;
  /** When the content was last saved in this language */
  updated_at: Scalars['String']['output'];
};

/** The business settings visitors may see: BusinessSettings without the agent fields */
export type PublicBusinessSettings = {
  __typename?: 'PublicBusinessSettings';
  assistantName?: Maybe<Scalars['String']['output']>;
  avatarUrl?: Maybe<Scalars['String']['output']>;
  businessName: Scalars['String']['output'];
  careersUrl?: Maybe<Scalars['String']['output']>;
  contactEmail?: Maybe<Scalars['String']['output']>;
  contactPhone?: Maybe<Scalars['String']['output']>;
  contactUrl?: Maybe<Scalars['String']['output']>;
  defaultLanguage?: Maybe<Scalars['String']['output']>;
  greeting?: Maybe<Array<LocalizedText>>;
  logoUrl?: Maybe<Scalars['String']['output']>;
  primaryColor?: Maybe<Scalars['String']['output']>;
  starters?: Maybe<Array<BusinessStarter>>;
  updatedAt: Scalars['String']['output'];
  websiteUrl?: Maybe<Scalars['String']['output']>;
};

export type PublicClientReference = {
  __typename?: 'PublicClientReference';
  id: Scalars['ID']['output'];
  logo_url?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
};

export type PublicContributionProject = {
  __typename?: 'PublicContributionProject';
  /** Null when the client is not public */
  client?: Maybe<PublicClientReference>;
  /** Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language */
  fallback_fields: Array<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  /** Language the project's name was returned in: the requested one, or English when the project has no translation in it or an outdated one */
  language: Scalars['String']['output'];
  name: Scalars['String']['output'];
};

export type PublicExperience = {
  __typename?: 'PublicExperience';
  company: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  end_date?: Maybe<Scalars['String']['output']>;
  /** Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language */
  fallback_fields: Array<Scalars['String']['output']>;
  /** Language the experience's content was returned in: the requested one, or English when it has no translation in it or an outdated one */
  language: Scalars['String']['output'];
  location: Scalars['String']['output'];
  logo_url?: Maybe<Scalars['String']['output']>;
  position: Scalars['String']['output'];
  start_date: Scalars['String']['output'];
};

export type PublicProjectContribution = {
  __typename?: 'PublicProjectContribution';
  description?: Maybe<Scalars['String']['output']>;
  end_date?: Maybe<Scalars['String']['output']>;
  /** Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language */
  fallback_fields: Array<Scalars['String']['output']>;
  /** Language the contribution's description was returned in: the requested one, or English when it has no translation in it or an outdated one */
  language: Scalars['String']['output'];
  project: PublicContributionProject;
  start_date: Scalars['String']['output'];
};

export type PublicTeamMemberCapability = {
  __typename?: 'PublicTeamMemberCapability';
  /** Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language */
  fallback_fields: Array<Scalars['String']['output']>;
  /** Language the capability's name was returned in: the requested one, or English when the capability has no translation in it or an outdated one */
  language: Scalars['String']['output'];
  name: Scalars['String']['output'];
  stars: Scalars['Int']['output'];
};

/** Public profile: only public project contributions and public clients */
export type PublicTeamMemberProfile = {
  __typename?: 'PublicTeamMemberProfile';
  bio?: Maybe<Scalars['String']['output']>;
  capabilities: Array<PublicTeamMemberCapability>;
  capability_highlights?: Maybe<Scalars['String']['output']>;
  education?: Maybe<Scalars['String']['output']>;
  experiences: Array<PublicExperience>;
  /** Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language */
  fallback_fields: Array<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  job_title: Scalars['String']['output'];
  /** Language the profile's content was returned in: the requested one, or English when the team member has no translation in it or an outdated one */
  language: Scalars['String']['output'];
  name: Scalars['String']['output'];
  profile_photo_url?: Maybe<Scalars['String']['output']>;
  project_contributions: Array<PublicProjectContribution>;
  webpage?: Maybe<Scalars['String']['output']>;
};

export type PublishedCount = {
  __typename?: 'PublishedCount';
  published: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type Query = {
  __typename?: 'Query';
  /** The account behind a session, or null when it was removed (checked on privileged requests) */
  adminAccount?: Maybe<AdminAccount>;
  /** Every admin account, the oldest first. Admins only */
  adminAccounts: Array<AdminAccount>;
  /** The active API keys, the newest first. Only with the installation's internal API key */
  apiKeys: Array<ApiKey>;
  /** Every business setting, agent fields included, or null until the installation is set up. Admins only */
  businessSettings?: Maybe<BusinessSettings>;
  calendar?: Maybe<Calendar>;
  /** Capabilities with their content in the language, English by default: one with no translation in it, or an outdated one (English changed after it was saved), is returned in English. missingLanguage keeps those with no translation in it, not even a draft. Only public capabilities, those a published project or team member uses, unless includeUnpublished */
  capabilities?: Maybe<Array<Maybe<Capability>>>;
  /** The capability with its content in the language, English by default, as capabilities returns it. A capability that is not public is not found unless includeUnpublished */
  capability?: Maybe<Capability>;
  /** The client with its content in the language, English by default, as clients returns it. An unpublished client is not found unless includeUnpublished */
  client?: Maybe<Client>;
  /** The client with its content in the language, English by default, as clients returns it. An unpublished client is not found unless includeUnpublished */
  clientBySlug?: Maybe<Client>;
  /** Clients with their content in the language, English by default, and their nested records too: one with no translation in it, or an outdated one (English changed after it was saved), is returned in English. missingLanguage keeps those with no translation in it, not even a draft. Only published clients unless includeUnpublished */
  clients?: Maybe<Array<Maybe<Client>>>;
  /** The company with its content in the language, English by default: with no translation in it, or an outdated one (English changed after it was saved), it is returned in English. Null until the company is first saved */
  company?: Maybe<Company>;
  /** Admin dashboard for the last days (1 to 365, today included), counted in the appointment settings time zone */
  dashboard: Dashboard;
  getDownloadUrl?: Maybe<GetUploadResponse>;
  /** The handoff settings, or their defaults until first saved. Admins only */
  handoffSettings: HandoffSettings;
  /** Whether any admin account exists (setup wizard decides whether to ask for the first admin) */
  hasAdminAccounts: Scalars['Boolean']['output'];
  /** The job opening with its content in the language, English by default, as jobOpenings returns it. An unpublished job opening is not found unless includeUnpublished */
  jobOpening?: Maybe<JobOpening>;
  /** The job opening with its content in the language, English by default, as jobOpenings returns it. An unpublished job opening is not found unless includeUnpublished */
  jobOpeningBySlug?: Maybe<JobOpening>;
  /** Job openings, most recently posted first, with their content in the language, English by default: one with no translation in it, or an outdated one (English changed after it was saved), is returned in English. missingLanguage keeps those with no translation in it, not even a draft. Only published job openings unless includeUnpublished */
  jobOpenings?: Maybe<Array<Maybe<JobOpening>>>;
  knowledgeSources: KnowledgeSources;
  /** The Lumi version this installation runs and the latest published release, so admins learn when an upgrade is available */
  lumiVersion: LumiVersion;
  /** Whether this installation has media storage, so images can be uploaded. Checks the configuration only: records nothing */
  mediaStorageConfigured: Scalars['Boolean']['output'];
  /** The project with its content in the language, English by default, as projects returns it. An unpublished project is not found unless includeUnpublished */
  project?: Maybe<Project>;
  /** The project with its content in the language, English by default, as projects returns it. An unpublished project is not found unless includeUnpublished */
  projectBySlug?: Maybe<Project>;
  /** Projects with their content in the language, English by default, and their nested records too: one with no translation in it, or an outdated one (English changed after it was saved), is returned in English. missingLanguage keeps those with content left to translate into it: the project has no translation in it, not even a draft, or one of its team member contributions with English text has none. Only published projects unless includeUnpublished */
  projects?: Maybe<Array<Maybe<Project>>>;
  /** The public business settings, or null until the installation is set up */
  publicBusinessSettings?: Maybe<PublicBusinessSettings>;
  /** A team member's profile as approved for public disclosure, or null when the team member is not published. Its content is in the language, English by default, as teamMembers returns it */
  publicTeamMember?: Maybe<PublicTeamMemberProfile>;
  /** The resume settings, or their defaults until first saved */
  resumeSettings: ResumeSettings;
  searchWebsitePages?: Maybe<Array<Maybe<WebsitePageResult>>>;
  /** The team member with their content in the language, English by default, as teamMembers returns it. An unpublished team member is not found unless includeUnpublished */
  teamMember?: Maybe<TeamMember>;
  /** The team member with their content in the language, English by default, as teamMembers returns it. An unpublished team member is not found unless includeUnpublished */
  teamMemberBySlug?: Maybe<TeamMember>;
  /** Team members with their content in the language, English by default, and their nested records too: one with no translation in it, or an outdated one (English changed after it was saved), is returned in English. missingLanguage keeps those with content left to translate into it: the team member has no translation in it, not even a draft, or one of their work experiences with English text has none. Only published team members unless includeUnpublished */
  teamMembers?: Maybe<Array<Maybe<TeamMember>>>;
  thread?: Maybe<Thread>;
  threads: Array<Thread>;
  website?: Maybe<Website>;
  websites?: Maybe<Array<Maybe<Website>>>;
};


export type QueryAdminAccountArgs = {
  id: Scalars['ID']['input'];
};


export type QueryCapabilitiesArgs = {
  includeUnpublished?: InputMaybe<Scalars['Boolean']['input']>;
  language?: InputMaybe<Scalars['String']['input']>;
  missingLanguage?: InputMaybe<Scalars['String']['input']>;
};


export type QueryCapabilityArgs = {
  id: Scalars['ID']['input'];
  includeUnpublished?: InputMaybe<Scalars['Boolean']['input']>;
  language?: InputMaybe<Scalars['String']['input']>;
};


export type QueryClientArgs = {
  id: Scalars['ID']['input'];
  includeUnpublished?: InputMaybe<Scalars['Boolean']['input']>;
  language?: InputMaybe<Scalars['String']['input']>;
};


export type QueryClientBySlugArgs = {
  includeUnpublished?: InputMaybe<Scalars['Boolean']['input']>;
  language?: InputMaybe<Scalars['String']['input']>;
  url_slug: Scalars['String']['input'];
};


export type QueryClientsArgs = {
  includeUnpublished?: InputMaybe<Scalars['Boolean']['input']>;
  language?: InputMaybe<Scalars['String']['input']>;
  missingLanguage?: InputMaybe<Scalars['String']['input']>;
};


export type QueryCompanyArgs = {
  language?: InputMaybe<Scalars['String']['input']>;
};


export type QueryDashboardArgs = {
  days: Scalars['Int']['input'];
};


export type QueryGetDownloadUrlArgs = {
  key: Scalars['String']['input'];
};


export type QueryJobOpeningArgs = {
  id: Scalars['ID']['input'];
  includeUnpublished?: InputMaybe<Scalars['Boolean']['input']>;
  language?: InputMaybe<Scalars['String']['input']>;
};


export type QueryJobOpeningBySlugArgs = {
  includeUnpublished?: InputMaybe<Scalars['Boolean']['input']>;
  language?: InputMaybe<Scalars['String']['input']>;
  url_slug: Scalars['String']['input'];
};


export type QueryJobOpeningsArgs = {
  includeUnpublished?: InputMaybe<Scalars['Boolean']['input']>;
  language?: InputMaybe<Scalars['String']['input']>;
  missingLanguage?: InputMaybe<Scalars['String']['input']>;
};


export type QueryProjectArgs = {
  id: Scalars['ID']['input'];
  includeUnpublished?: InputMaybe<Scalars['Boolean']['input']>;
  language?: InputMaybe<Scalars['String']['input']>;
};


export type QueryProjectBySlugArgs = {
  includeUnpublished?: InputMaybe<Scalars['Boolean']['input']>;
  language?: InputMaybe<Scalars['String']['input']>;
  url_slug: Scalars['String']['input'];
};


export type QueryProjectsArgs = {
  includeUnpublished?: InputMaybe<Scalars['Boolean']['input']>;
  language?: InputMaybe<Scalars['String']['input']>;
  missingLanguage?: InputMaybe<Scalars['String']['input']>;
};


export type QueryPublicTeamMemberArgs = {
  id: Scalars['ID']['input'];
  language?: InputMaybe<Scalars['String']['input']>;
};


export type QuerySearchWebsitePagesArgs = {
  query: Scalars['String']['input'];
};


export type QueryTeamMemberArgs = {
  id: Scalars['ID']['input'];
  includeUnpublished?: InputMaybe<Scalars['Boolean']['input']>;
  language?: InputMaybe<Scalars['String']['input']>;
};


export type QueryTeamMemberBySlugArgs = {
  includeUnpublished?: InputMaybe<Scalars['Boolean']['input']>;
  language?: InputMaybe<Scalars['String']['input']>;
  url_slug: Scalars['String']['input'];
};


export type QueryTeamMembersArgs = {
  includeUnpublished?: InputMaybe<Scalars['Boolean']['input']>;
  language?: InputMaybe<Scalars['String']['input']>;
  missingLanguage?: InputMaybe<Scalars['String']['input']>;
};


export type QueryThreadArgs = {
  id: Scalars['ID']['input'];
};


export type QueryWebsiteArgs = {
  id: Scalars['ID']['input'];
};

/** Whether Lumi offers team member resumes, and the logo, colours and footer text of the PDF, as entered (@lumi/shared-contracts/resume). Null fields are unset, so their default applies. Public: the web app renders them into the PDF */
export type ResumeSettings = {
  __typename?: 'ResumeSettings';
  /** Section headings, their dividers and the footer text, lowercase #rrggbb. Null uses the neutral default */
  accentColor?: Maybe<Scalars['String']['output']>;
  /** Whether Lumi offers resumes. While off, the chat, the admin and the MCP server don't link them and their URLs return not found */
  enabled: Scalars['Boolean']['output'];
  /** The text in the footer band, e.g. the website's address, linked to the business website when it has one. Null leaves the footer band out */
  footerText?: Maybe<Scalars['String']['output']>;
  /** A second colour the footer text fades from into the accent colour, lowercase #rrggbb. Null shows the footer text in the accent colour */
  gradientColor?: Maybe<Scalars['String']['output']>;
  /** The header and footer bands' background, lowercase #rrggbb. Null uses the neutral default */
  headerColor?: Maybe<Scalars['String']['output']>;
  /** The logo in the resume's header band: an absolute URL or a path on the web app. Null shows the business name */
  logoUrl?: Maybe<Scalars['String']['output']>;
  /** Null until the settings are first saved, while the defaults apply (resumes on, neutral colours, no logo, no footer text) */
  updatedAt?: Maybe<Scalars['String']['output']>;
};

/** Every setting: those left null or empty are unset (cleared). An invalid input fails with BAD_USER_INPUT and extensions.problems, a list of { field, message } such as accentColor */
export type ResumeSettingsInput = {
  accentColor?: InputMaybe<Scalars['String']['input']>;
  enabled: Scalars['Boolean']['input'];
  /** At most 60 characters */
  footerText?: InputMaybe<Scalars['String']['input']>;
  gradientColor?: InputMaybe<Scalars['String']['input']>;
  headerColor?: InputMaybe<Scalars['String']['input']>;
  logoUrl?: InputMaybe<Scalars['String']['input']>;
};

export type Slot = {
  __typename?: 'Slot';
  end?: Maybe<Scalars['Int']['output']>;
  start?: Maybe<Scalars['Int']['output']>;
};

/** How the installation names a structured source, in English */
export type SourceLabel = {
  __typename?: 'SourceLabel';
  plural: Scalars['String']['output'];
  singular: Scalars['String']['output'];
};

/** Trimmed, 1 to 40 characters each */
export type SourceLabelInput = {
  plural: Scalars['String']['input'];
  singular: Scalars['String']['input'];
};

/** Every structured source's label: those an admin saved, the defaults (Team member, Project, Client, Capability, Job opening) for the rest */
export type SourceLabels = {
  __typename?: 'SourceLabels';
  capabilities: SourceLabel;
  clients: SourceLabel;
  jobOpenings: SourceLabel;
  projects: SourceLabel;
  teamMembers: SourceLabel;
};

export type SourceLabelsInput = {
  capabilities: SourceLabelInput;
  clients: SourceLabelInput;
  jobOpenings: SourceLabelInput;
  projects: SourceLabelInput;
  teamMembers: SourceLabelInput;
};

export type StructuredSourcesInput = {
  capabilities: Scalars['Boolean']['input'];
  clients: Scalars['Boolean']['input'];
  jobOpenings: Scalars['Boolean']['input'];
  labels: SourceLabelsInput;
  projects: Scalars['Boolean']['input'];
  teamMembers: Scalars['Boolean']['input'];
};

export type TeamMember = {
  __typename?: 'TeamMember';
  bio?: Maybe<Scalars['String']['output']>;
  capabilities?: Maybe<Array<Maybe<TeamMemberCapability>>>;
  capability_highlights?: Maybe<Scalars['String']['output']>;
  created_at: Scalars['String']['output'];
  education?: Maybe<Scalars['String']['output']>;
  experiences?: Maybe<Array<Maybe<Experience>>>;
  /** Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language */
  fallback_fields: Array<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  job_title: Scalars['String']['output'];
  /** Language the content was returned in: the requested one, or English when the team member has no translation in it or an outdated one */
  language: Scalars['String']['output'];
  name: Scalars['String']['output'];
  profile_photo_key?: Maybe<Scalars['ID']['output']>;
  /** Contributions to published projects; includeUnpublished adds those to unpublished ones */
  project_contributions?: Maybe<Array<Maybe<ProjectContribution>>>;
  /** Approved for external disclosure */
  published: Scalars['Boolean']['output'];
  /** The team member's content in every language it has, English first */
  translations: Array<TeamMemberTranslation>;
  updated_at: Scalars['String']['output'];
  url_slug: Scalars['String']['output'];
  webpage?: Maybe<Scalars['String']['output']>;
};


export type TeamMemberProject_ContributionsArgs = {
  includeUnpublished?: InputMaybe<Scalars['Boolean']['input']>;
};

export type TeamMemberCapability = {
  __typename?: 'TeamMemberCapability';
  /** Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language */
  fallback_fields: Array<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  /** Language the capability's name was returned in: the requested one, or English when the capability has no translation in it or an outdated one */
  language: Scalars['String']['output'];
  name: Scalars['String']['output'];
  stars: Scalars['Int']['output'];
};

export type TeamMemberCapabilityInput = {
  id: Scalars['ID']['input'];
  stars: Scalars['Int']['input'];
};

export type TeamMemberInProject = {
  __typename?: 'TeamMemberInProject';
  description?: Maybe<Scalars['String']['output']>;
  end_date?: Maybe<Scalars['String']['output']>;
  /** Content fields returned in English because the translation in language leaves them untranslated; empty when the whole record came back in language */
  fallback_fields: Array<Scalars['String']['output']>;
  /** Language the contribution's content was returned in: the requested one, or English when it has no translation in it or an outdated one */
  language: Scalars['String']['output'];
  start_date: Scalars['String']['output'];
  teamMember?: Maybe<TeamMember>;
  /** The contribution's content in every language it has, English first */
  translations: Array<ProjectContributionTranslation>;
};

export type TeamMemberInput = {
  bio?: InputMaybe<Scalars['String']['input']>;
  capability_highlights?: InputMaybe<Scalars['String']['input']>;
  education?: InputMaybe<Scalars['String']['input']>;
  job_title: Scalars['String']['input'];
  name: Scalars['String']['input'];
  published?: InputMaybe<Scalars['Boolean']['input']>;
  url_slug: Scalars['String']['input'];
  webpage?: InputMaybe<Scalars['String']['input']>;
};

/** A team member's content in one language, as saved. A null field is not translated in it and reads in English */
export type TeamMemberTranslation = {
  __typename?: 'TeamMemberTranslation';
  bio?: Maybe<Scalars['String']['output']>;
  capability_highlights?: Maybe<Scalars['String']['output']>;
  /** An AI translation saved for review: reads skip it and return English until the team saves the translation. Always false in English */
  draft: Scalars['Boolean']['output'];
  education?: Maybe<Scalars['String']['output']>;
  job_title?: Maybe<Scalars['String']['output']>;
  language: Scalars['String']['output'];
  /** English changed since this translation was saved, so it may need reviewing. Always false in English */
  outdated: Scalars['Boolean']['output'];
  /** When the content was last saved in this language */
  updated_at: Scalars['String']['output'];
};

export type Thread = {
  __typename?: 'Thread';
  closed: Scalars['Boolean']['output'];
  /** Total LLM cost in USD of the conversation's model calls (agent turns, helpers and summaries). Null when no usage was recorded, or when a call has no price and the total would be incomplete */
  cost?: Maybe<Scalars['Float']['output']>;
  createdAt: Scalars['String']['output'];
  email?: Maybe<Scalars['String']['output']>;
  /** The enquiries sent from the conversation, newest first */
  enquiries: Array<Enquiry>;
  /** Whether an enquiry of the conversation is partial or failed, so the team must retry it or follow up */
  enquiryFailed: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  name?: Maybe<Scalars['String']['output']>;
  /** The http(s) URL of the page the visitor started the conversation on, e.g. the website page embedding the chat, keeping only its utm_source, utm_medium, utm_campaign and utm_id query parameters. Only pages on the business website, a crawled website or the Lumi app are recorded. Null when unknown, as for conversations started before it was recorded */
  pageUrl?: Maybe<Scalars['String']['output']>;
  phone?: Maybe<Scalars['String']['output']>;
  summary?: Maybe<Scalars['String']['output']>;
  topic?: Maybe<Scalars['String']['output']>;
  /** Token usage and cost per purpose and model, most expensive first. Empty when no usage was recorded */
  usage: Array<ModelUsage>;
};

export type ThreadInput = {
  closed?: InputMaybe<Scalars['Boolean']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
  summary?: InputMaybe<Scalars['String']['input']>;
  topic?: InputMaybe<Scalars['String']['input']>;
};

/** A kind of record whose content is stored per language */
export enum TranslatedRecordType {
  Capability = 'CAPABILITY',
  Client = 'CLIENT',
  Experience = 'EXPERIENCE',
  JobOpening = 'JOB_OPENING',
  Project = 'PROJECT',
  ProjectTeamMember = 'PROJECT_TEAM_MEMBER',
  TeamMember = 'TEAM_MEMBER'
}

export type TranslationDraftInput = {
  fields: Array<TranslationFieldInput>;
  /** The record's id. For PROJECT_TEAM_MEMBER, the project's id */
  id: Scalars['ID']['input'];
  /** PROJECT_TEAM_MEMBER only: the team member's id */
  team_member_id?: InputMaybe<Scalars['ID']['input']>;
  type: TranslatedRecordType;
};

export type TranslationDraftsResult = {
  __typename?: 'TranslationDraftsResult';
  /** Items saved as drafts, those replacing an outdated translation included */
  saved: Scalars['Int']['output'];
  /** Fields of the saved items left untranslated, as their text was empty or longer than the field stores */
  untranslated: Scalars['Int']['output'];
};

/** A translated content field, by its name in the record's translation type, e.g. bio */
export type TranslationFieldInput = {
  field: Scalars['String']['input'];
  /** The English text it was translated from, so a draft of English that changed meanwhile reads as outdated once published */
  source: Scalars['String']['input'];
  /** The translation */
  text: Scalars['String']['input'];
};

export enum UpdateCheck {
  Off = 'OFF',
  Ok = 'OK',
  Unavailable = 'UNAVAILABLE'
}

export type Website = {
  __typename?: 'Website';
  created_at: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  exclude_paths?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  id: Scalars['ID']['output'];
  last_processed?: Maybe<Scalars['String']['output']>;
  /** The website's most recent crawl, or none if it was never crawled since crawls were tracked */
  latestCrawl?: Maybe<WebsiteCrawl>;
  name: Scalars['String']['output'];
  sitemap: Scalars['String']['output'];
  updated_at: Scalars['String']['output'];
  url?: Maybe<Scalars['String']['output']>;
};

export type WebsiteCrawl = {
  __typename?: 'WebsiteCrawl';
  createdAt: Scalars['String']['output'];
  /** Why the crawl failed */
  error?: Maybe<Scalars['String']['output']>;
  finishedAt?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  kind: WebsiteCrawlKind;
  /** Sitemap pages checked so far, modified or not */
  pagesChecked: Scalars['Int']['output'];
  /** Sitemap pages left out because the crawl reached its page limit */
  pagesOverLimit: Scalars['Int']['output'];
  /** Pages crawled again because they were new or modified */
  pagesProcessed: Scalars['Int']['output'];
  /** Pages removed with their search content: no longer in the sitemap, now excluded, gone (401, 403, 404 or 410) or not indexable */
  pagesRemoved: Scalars['Int']['output'];
  /** Sitemap pages to check, after exclusions. Unknown until the sitemap is read */
  pagesTotal?: Maybe<Scalars['Int']['output']>;
  startedAt?: Maybe<Scalars['String']['output']>;
  status: WebsiteCrawlStatus;
};

/** Update Pages crawls new and modified pages; Re-process crawls them all after clearing them */
export enum WebsiteCrawlKind {
  Reprocess = 'REPROCESS',
  Update = 'UPDATE'
}

export enum WebsiteCrawlStatus {
  Completed = 'COMPLETED',
  Failed = 'FAILED',
  /** Was running and ended without reporting how, for example when its Lambda was killed */
  Interrupted = 'INTERRUPTED',
  /** Requested five minutes ago or more, and the crawler never picked it up */
  NotStarted = 'NOT_STARTED',
  /** Requested, and the crawler hasn't picked it up yet */
  Queued = 'QUEUED',
  Running = 'RUNNING',
  /** Ran out of time before the Lambda timeout. Update Pages continues it */
  Stopped = 'STOPPED'
}

export type WebsiteInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  exclude_paths?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  name: Scalars['String']['input'];
  sitemap: Scalars['String']['input'];
  url: Scalars['String']['input'];
};

export type WebsitePageResult = {
  __typename?: 'WebsitePageResult';
  documents?: Maybe<Array<Maybe<Document>>>;
  title: Scalars['String']['output'];
  url: Scalars['String']['output'];
};



export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = Record<PropertyKey, never>, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;





/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  AdminAccount: ResolverTypeWrapper<AdminAccount>;
  AdminUsageInput: AdminUsageInput;
  AllowedTime: ResolverTypeWrapper<AllowedTime>;
  AllowedTimeInput: AllowedTimeInput;
  ApiKey: ResolverTypeWrapper<ApiKey>;
  ApiKeyAccess: ApiKeyAccess;
  Availability: ResolverTypeWrapper<Availability>;
  BookingSetting: ResolverTypeWrapper<BookingSetting>;
  BookingSettingInput: BookingSettingInput;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  BusinessSettings: ResolverTypeWrapper<BusinessSettings>;
  BusinessSettingsInput: BusinessSettingsInput;
  BusinessStarter: ResolverTypeWrapper<BusinessStarter>;
  BusinessStarterInput: BusinessStarterInput;
  Calendar: ResolverTypeWrapper<Calendar>;
  CalendarInput: CalendarInput;
  Capability: ResolverTypeWrapper<Capability>;
  CapabilityInput: CapabilityInput;
  CapabilityTranslation: ResolverTypeWrapper<CapabilityTranslation>;
  Client: ResolverTypeWrapper<ClientMapper>;
  ClientInput: ClientInput;
  ClientTranslation: ResolverTypeWrapper<ClientTranslation>;
  Company: ResolverTypeWrapper<Company>;
  CompanyInput: CompanyInput;
  CompanyTranslation: ResolverTypeWrapper<CompanyTranslation>;
  CreateUploadResponse: ResolverTypeWrapper<CreateUploadResponse>;
  CreatedAdminAccount: ResolverTypeWrapper<CreatedAdminAccount>;
  CreatedApiKey: ResolverTypeWrapper<CreatedApiKey>;
  Dashboard: ResolverTypeWrapper<Omit<Dashboard, 'recentLeads'> & { recentLeads: Array<ResolversTypes['Thread']> }>;
  DashboardContent: ResolverTypeWrapper<DashboardContent>;
  DashboardDay: ResolverTypeWrapper<DashboardDay>;
  DashboardMcp: ResolverTypeWrapper<DashboardMcp>;
  DashboardWebsite: ResolverTypeWrapper<DashboardWebsite>;
  DeliveryChannel: ResolverTypeWrapper<DeliveryChannel>;
  DeliveryChannelInput: DeliveryChannelInput;
  Document: ResolverTypeWrapper<Document>;
  Enquiry: ResolverTypeWrapper<Enquiry>;
  EnquiryAnswer: ResolverTypeWrapper<EnquiryAnswer>;
  EnquiryContactValue: ResolverTypeWrapper<EnquiryContactValue>;
  EnquiryDelivery: ResolverTypeWrapper<EnquiryDelivery>;
  EnquiryFieldSetting: ResolverTypeWrapper<EnquiryFieldSetting>;
  EnquiryFieldSettingInput: EnquiryFieldSettingInput;
  EventInput: EventInput;
  Experience: ResolverTypeWrapper<Experience>;
  ExperienceInput: ExperienceInput;
  ExperienceTranslation: ResolverTypeWrapper<ExperienceTranslation>;
  FirstAdminInput: FirstAdminInput;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  GetUploadResponse: ResolverTypeWrapper<GetUploadResponse>;
  HandoffSettings: ResolverTypeWrapper<HandoffSettings>;
  HandoffSettingsInput: HandoffSettingsInput;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>;
  JobOpening: ResolverTypeWrapper<JobOpening>;
  JobOpeningInput: JobOpeningInput;
  JobOpeningTranslation: ResolverTypeWrapper<JobOpeningTranslation>;
  KnowledgeSources: ResolverTypeWrapper<KnowledgeSources>;
  LocalizedText: ResolverTypeWrapper<LocalizedText>;
  LocalizedTextInput: LocalizedTextInput;
  LumiRelease: ResolverTypeWrapper<LumiRelease>;
  LumiVersion: ResolverTypeWrapper<LumiVersion>;
  McpAuditEvent: ResolverTypeWrapper<McpAuditEvent>;
  ModelUsage: ResolverTypeWrapper<ModelUsage>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  NewAdminAccountInput: NewAdminAccountInput;
  NewApiKeyInput: NewApiKeyInput;
  Project: ResolverTypeWrapper<ProjectMapper>;
  ProjectContribution: ResolverTypeWrapper<Omit<ProjectContribution, 'project'> & { project: ResolversTypes['Project'] }>;
  ProjectContributionTranslation: ResolverTypeWrapper<ProjectContributionTranslation>;
  ProjectInput: ProjectInput;
  ProjectTeamMemberInput: ProjectTeamMemberInput;
  ProjectTranslation: ResolverTypeWrapper<ProjectTranslation>;
  PublicBusinessSettings: ResolverTypeWrapper<PublicBusinessSettings>;
  PublicClientReference: ResolverTypeWrapper<PublicClientReference>;
  PublicContributionProject: ResolverTypeWrapper<PublicContributionProject>;
  PublicExperience: ResolverTypeWrapper<PublicExperience>;
  PublicProjectContribution: ResolverTypeWrapper<PublicProjectContribution>;
  PublicTeamMemberCapability: ResolverTypeWrapper<PublicTeamMemberCapability>;
  PublicTeamMemberProfile: ResolverTypeWrapper<PublicTeamMemberProfile>;
  PublishedCount: ResolverTypeWrapper<PublishedCount>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  ResumeSettings: ResolverTypeWrapper<ResumeSettings>;
  ResumeSettingsInput: ResumeSettingsInput;
  Slot: ResolverTypeWrapper<Slot>;
  SourceLabel: ResolverTypeWrapper<SourceLabel>;
  SourceLabelInput: SourceLabelInput;
  SourceLabels: ResolverTypeWrapper<SourceLabels>;
  SourceLabelsInput: SourceLabelsInput;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  StructuredSourcesInput: StructuredSourcesInput;
  TeamMember: ResolverTypeWrapper<TeamMemberMapper>;
  TeamMemberCapability: ResolverTypeWrapper<TeamMemberCapability>;
  TeamMemberCapabilityInput: TeamMemberCapabilityInput;
  TeamMemberInProject: ResolverTypeWrapper<Omit<TeamMemberInProject, 'teamMember'> & { teamMember?: Maybe<ResolversTypes['TeamMember']> }>;
  TeamMemberInput: TeamMemberInput;
  TeamMemberTranslation: ResolverTypeWrapper<TeamMemberTranslation>;
  Thread: ResolverTypeWrapper<ThreadMapper>;
  ThreadInput: ThreadInput;
  TranslatedRecordType: TranslatedRecordType;
  TranslationDraftInput: TranslationDraftInput;
  TranslationDraftsResult: ResolverTypeWrapper<TranslationDraftsResult>;
  TranslationFieldInput: TranslationFieldInput;
  UpdateCheck: UpdateCheck;
  Website: ResolverTypeWrapper<Website>;
  WebsiteCrawl: ResolverTypeWrapper<WebsiteCrawl>;
  WebsiteCrawlKind: WebsiteCrawlKind;
  WebsiteCrawlStatus: WebsiteCrawlStatus;
  WebsiteInput: WebsiteInput;
  WebsitePageResult: ResolverTypeWrapper<WebsitePageResult>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  AdminAccount: AdminAccount;
  AdminUsageInput: AdminUsageInput;
  AllowedTime: AllowedTime;
  AllowedTimeInput: AllowedTimeInput;
  ApiKey: ApiKey;
  Availability: Availability;
  BookingSetting: BookingSetting;
  BookingSettingInput: BookingSettingInput;
  Boolean: Scalars['Boolean']['output'];
  BusinessSettings: BusinessSettings;
  BusinessSettingsInput: BusinessSettingsInput;
  BusinessStarter: BusinessStarter;
  BusinessStarterInput: BusinessStarterInput;
  Calendar: Calendar;
  CalendarInput: CalendarInput;
  Capability: Capability;
  CapabilityInput: CapabilityInput;
  CapabilityTranslation: CapabilityTranslation;
  Client: ClientMapper;
  ClientInput: ClientInput;
  ClientTranslation: ClientTranslation;
  Company: Company;
  CompanyInput: CompanyInput;
  CompanyTranslation: CompanyTranslation;
  CreateUploadResponse: CreateUploadResponse;
  CreatedAdminAccount: CreatedAdminAccount;
  CreatedApiKey: CreatedApiKey;
  Dashboard: Omit<Dashboard, 'recentLeads'> & { recentLeads: Array<ResolversParentTypes['Thread']> };
  DashboardContent: DashboardContent;
  DashboardDay: DashboardDay;
  DashboardMcp: DashboardMcp;
  DashboardWebsite: DashboardWebsite;
  DeliveryChannel: DeliveryChannel;
  DeliveryChannelInput: DeliveryChannelInput;
  Document: Document;
  Enquiry: Enquiry;
  EnquiryAnswer: EnquiryAnswer;
  EnquiryContactValue: EnquiryContactValue;
  EnquiryDelivery: EnquiryDelivery;
  EnquiryFieldSetting: EnquiryFieldSetting;
  EnquiryFieldSettingInput: EnquiryFieldSettingInput;
  EventInput: EventInput;
  Experience: Experience;
  ExperienceInput: ExperienceInput;
  ExperienceTranslation: ExperienceTranslation;
  FirstAdminInput: FirstAdminInput;
  Float: Scalars['Float']['output'];
  GetUploadResponse: GetUploadResponse;
  HandoffSettings: HandoffSettings;
  HandoffSettingsInput: HandoffSettingsInput;
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  JSON: Scalars['JSON']['output'];
  JobOpening: JobOpening;
  JobOpeningInput: JobOpeningInput;
  JobOpeningTranslation: JobOpeningTranslation;
  KnowledgeSources: KnowledgeSources;
  LocalizedText: LocalizedText;
  LocalizedTextInput: LocalizedTextInput;
  LumiRelease: LumiRelease;
  LumiVersion: LumiVersion;
  McpAuditEvent: McpAuditEvent;
  ModelUsage: ModelUsage;
  Mutation: Record<PropertyKey, never>;
  NewAdminAccountInput: NewAdminAccountInput;
  NewApiKeyInput: NewApiKeyInput;
  Project: ProjectMapper;
  ProjectContribution: Omit<ProjectContribution, 'project'> & { project: ResolversParentTypes['Project'] };
  ProjectContributionTranslation: ProjectContributionTranslation;
  ProjectInput: ProjectInput;
  ProjectTeamMemberInput: ProjectTeamMemberInput;
  ProjectTranslation: ProjectTranslation;
  PublicBusinessSettings: PublicBusinessSettings;
  PublicClientReference: PublicClientReference;
  PublicContributionProject: PublicContributionProject;
  PublicExperience: PublicExperience;
  PublicProjectContribution: PublicProjectContribution;
  PublicTeamMemberCapability: PublicTeamMemberCapability;
  PublicTeamMemberProfile: PublicTeamMemberProfile;
  PublishedCount: PublishedCount;
  Query: Record<PropertyKey, never>;
  ResumeSettings: ResumeSettings;
  ResumeSettingsInput: ResumeSettingsInput;
  Slot: Slot;
  SourceLabel: SourceLabel;
  SourceLabelInput: SourceLabelInput;
  SourceLabels: SourceLabels;
  SourceLabelsInput: SourceLabelsInput;
  String: Scalars['String']['output'];
  StructuredSourcesInput: StructuredSourcesInput;
  TeamMember: TeamMemberMapper;
  TeamMemberCapability: TeamMemberCapability;
  TeamMemberCapabilityInput: TeamMemberCapabilityInput;
  TeamMemberInProject: Omit<TeamMemberInProject, 'teamMember'> & { teamMember?: Maybe<ResolversParentTypes['TeamMember']> };
  TeamMemberInput: TeamMemberInput;
  TeamMemberTranslation: TeamMemberTranslation;
  Thread: ThreadMapper;
  ThreadInput: ThreadInput;
  TranslationDraftInput: TranslationDraftInput;
  TranslationDraftsResult: TranslationDraftsResult;
  TranslationFieldInput: TranslationFieldInput;
  Website: Website;
  WebsiteCrawl: WebsiteCrawl;
  WebsiteInput: WebsiteInput;
  WebsitePageResult: WebsitePageResult;
};

export type AdminAccountResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AdminAccount'] = ResolversParentTypes['AdminAccount']> = {
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  lastSignInAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  mustChangePassword?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  passwordChangedAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type AllowedTimeResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AllowedTime'] = ResolversParentTypes['AllowedTime']> = {
  hour?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  minutes?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type ApiKeyResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ApiKey'] = ResolversParentTypes['ApiKey']> = {
  access?: Resolver<ResolversTypes['ApiKeyAccess'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdBy?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  lastCharacters?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  lastUsedAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type AvailabilityResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Availability'] = ResolversParentTypes['Availability']> = {
  slots?: Resolver<Maybe<Array<Maybe<ResolversTypes['Slot']>>>, ParentType, ContextType>;
};

export type BookingSettingResolvers<ContextType = Context, ParentType extends ResolversParentTypes['BookingSetting'] = ResolversParentTypes['BookingSetting']> = {
  label?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  url?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type BusinessSettingsResolvers<ContextType = Context, ParentType extends ResolversParentTypes['BusinessSettings'] = ResolversParentTypes['BusinessSettings']> = {
  agentDescription?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  agentGuidance?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  assistantName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  avatarUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  businessName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  careersUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  contactEmail?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  contactPhone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  contactUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  defaultLanguage?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  greeting?: Resolver<Maybe<Array<ResolversTypes['LocalizedText']>>, ParentType, ContextType>;
  logoUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  primaryColor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  starters?: Resolver<Maybe<Array<ResolversTypes['BusinessStarter']>>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  websiteUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type BusinessStarterResolvers<ContextType = Context, ParentType extends ResolversParentTypes['BusinessStarter'] = ResolversParentTypes['BusinessStarter']> = {
  icon?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  label?: Resolver<Array<ResolversTypes['LocalizedText']>, ParentType, ContextType>;
  message?: Resolver<Array<ResolversTypes['LocalizedText']>, ParentType, ContextType>;
};

export type CalendarResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Calendar'] = ResolversParentTypes['Calendar']> = {
  allowedDays?: Resolver<Array<ResolversTypes['Int']>, ParentType, ContextType>;
  allowedTimes?: Resolver<Array<ResolversTypes['AllowedTime']>, ParentType, ContextType>;
  availability?: Resolver<Maybe<ResolversTypes['Availability']>, ParentType, ContextType, Partial<CalendarAvailabilityArgs>>;
  bookingEmail?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  calendars?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  hostTimezone?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  maxDaysOut?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  meetingDurationMins?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  minAvailableTimeBeforeSlot?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  sameDayMinHours?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type CapabilityResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Capability'] = ResolversParentTypes['Capability']> = {
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  fallback_fields?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  translations?: Resolver<Array<ResolversTypes['CapabilityTranslation']>, ParentType, ContextType>;
};

export type CapabilityTranslationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['CapabilityTranslation'] = ResolversParentTypes['CapabilityTranslation']> = {
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  draft?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  outdated?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  updated_at?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ClientResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Client'] = ResolversParentTypes['Client']> = {
  client_website?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  fallback_fields?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  internal_webpage?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  logo_key?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  projects?: Resolver<Maybe<Array<Maybe<ResolversTypes['Project']>>>, ParentType, ContextType, RequireFields<ClientProjectsArgs, 'includeUnpublished'>>;
  published?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  summary?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  translations?: Resolver<Array<ResolversTypes['ClientTranslation']>, ParentType, ContextType>;
  url_slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ClientTranslationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ClientTranslation'] = ResolversParentTypes['ClientTranslation']> = {
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  draft?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  outdated?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  summary?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updated_at?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type CompanyResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Company'] = ResolversParentTypes['Company']> = {
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  fallback_fields?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  founding_story?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  location?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  mission?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  phone?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  translations?: Resolver<Array<ResolversTypes['CompanyTranslation']>, ParentType, ContextType>;
  values?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  vision?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  webpage?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type CompanyTranslationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['CompanyTranslation'] = ResolversParentTypes['CompanyTranslation']> = {
  draft?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  founding_story?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  mission?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  outdated?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  updated_at?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  values?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  vision?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type CreateUploadResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['CreateUploadResponse'] = ResolversParentTypes['CreateUploadResponse']> = {
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  signedUrl?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type CreatedAdminAccountResolvers<ContextType = Context, ParentType extends ResolversParentTypes['CreatedAdminAccount'] = ResolversParentTypes['CreatedAdminAccount']> = {
  account?: Resolver<ResolversTypes['AdminAccount'], ParentType, ContextType>;
  temporaryPassword?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type CreatedApiKeyResolvers<ContextType = Context, ParentType extends ResolversParentTypes['CreatedApiKey'] = ResolversParentTypes['CreatedApiKey']> = {
  apiKey?: Resolver<ResolversTypes['ApiKey'], ParentType, ContextType>;
  secret?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type DashboardResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Dashboard'] = ResolversParentTypes['Dashboard']> = {
  activity?: Resolver<Array<ResolversTypes['DashboardDay']>, ParentType, ContextType>;
  content?: Resolver<ResolversTypes['DashboardContent'], ParentType, ContextType>;
  conversationsCost?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  mcp?: Resolver<ResolversTypes['DashboardMcp'], ParentType, ContextType>;
  recentLeads?: Resolver<Array<ResolversTypes['Thread']>, ParentType, ContextType>;
  timeZone?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  usage?: Resolver<Array<ResolversTypes['ModelUsage']>, ParentType, ContextType>;
  websites?: Resolver<Array<ResolversTypes['DashboardWebsite']>, ParentType, ContextType>;
};

export type DashboardContentResolvers<ContextType = Context, ParentType extends ResolversParentTypes['DashboardContent'] = ResolversParentTypes['DashboardContent']> = {
  capabilities?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  clients?: Resolver<ResolversTypes['PublishedCount'], ParentType, ContextType>;
  jobOpenings?: Resolver<ResolversTypes['PublishedCount'], ParentType, ContextType>;
  projects?: Resolver<ResolversTypes['PublishedCount'], ParentType, ContextType>;
  teamMembers?: Resolver<ResolversTypes['PublishedCount'], ParentType, ContextType>;
};

export type DashboardDayResolvers<ContextType = Context, ParentType extends ResolversParentTypes['DashboardDay'] = ResolversParentTypes['DashboardDay']> = {
  conversations?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  cost?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  date?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  leads?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  meetings?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  unpricedCalls?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type DashboardMcpResolvers<ContextType = Context, ParentType extends ResolversParentTypes['DashboardMcp'] = ResolversParentTypes['DashboardMcp']> = {
  calls?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  errors?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  recent?: Resolver<Array<ResolversTypes['McpAuditEvent']>, ParentType, ContextType>;
};

export type DashboardWebsiteResolvers<ContextType = Context, ParentType extends ResolversParentTypes['DashboardWebsite'] = ResolversParentTypes['DashboardWebsite']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  lastProcessed?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  pages?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type DeliveryChannelResolvers<ContextType = Context, ParentType extends ResolversParentTypes['DeliveryChannel'] = ResolversParentTypes['DeliveryChannel']> = {
  hasSecret?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  recipients?: Resolver<Maybe<Array<ResolversTypes['String']>>, ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  url?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type DocumentResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Document'] = ResolversParentTypes['Document']> = {
  metadata?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  pageContent?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type EnquiryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Enquiry'] = ResolversParentTypes['Enquiry']> = {
  contact?: Resolver<Array<ResolversTypes['EnquiryContactValue']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  deliveries?: Resolver<Array<ResolversTypes['EnquiryDelivery']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  qualification?: Resolver<Array<ResolversTypes['EnquiryAnswer']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  submissionId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  topic?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type EnquiryAnswerResolvers<ContextType = Context, ParentType extends ResolversParentTypes['EnquiryAnswer'] = ResolversParentTypes['EnquiryAnswer']> = {
  answer?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  question?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type EnquiryContactValueResolvers<ContextType = Context, ParentType extends ResolversParentTypes['EnquiryContactValue'] = ResolversParentTypes['EnquiryContactValue']> = {
  field?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  value?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type EnquiryDeliveryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['EnquiryDelivery'] = ResolversParentTypes['EnquiryDelivery']> = {
  attempts?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  channelKey?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  channelType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  deliveredAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  destination?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  lastError?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type EnquiryFieldSettingResolvers<ContextType = Context, ParentType extends ResolversParentTypes['EnquiryFieldSetting'] = ResolversParentTypes['EnquiryFieldSetting']> = {
  field?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  mode?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ExperienceResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Experience'] = ResolversParentTypes['Experience']> = {
  company?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  end_date?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  fallback_fields?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  location?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  logo_key?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  position?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  start_date?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  translations?: Resolver<Array<ResolversTypes['ExperienceTranslation']>, ParentType, ContextType>;
};

export type ExperienceTranslationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ExperienceTranslation'] = ResolversParentTypes['ExperienceTranslation']> = {
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  draft?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  outdated?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  position?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updated_at?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type GetUploadResponseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['GetUploadResponse'] = ResolversParentTypes['GetUploadResponse']> = {
  contentType?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  signedUrl?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type HandoffSettingsResolvers<ContextType = Context, ParentType extends ResolversParentTypes['HandoffSettings'] = ResolversParentTypes['HandoffSettings']> = {
  availableChannelTypes?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  booking?: Resolver<ResolversTypes['BookingSetting'], ParentType, ContextType>;
  channels?: Resolver<Array<ResolversTypes['DeliveryChannel']>, ParentType, ContextType>;
  enquiryEnabled?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  enquiryFields?: Resolver<Array<ResolversTypes['EnquiryFieldSetting']>, ParentType, ContextType>;
  qualificationQuestions?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export interface JsonScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON';
}

export type JobOpeningResolvers<ContextType = Context, ParentType extends ResolversParentTypes['JobOpening'] = ResolversParentTypes['JobOpening']> = {
  application_url?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  created_at?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  fallback_fields?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  location?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  posted_at?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  published?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  summary?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  translations?: Resolver<Array<ResolversTypes['JobOpeningTranslation']>, ParentType, ContextType>;
  updated_at?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  url_slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  work_mode?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type JobOpeningTranslationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['JobOpeningTranslation'] = ResolversParentTypes['JobOpeningTranslation']> = {
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  draft?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  outdated?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  summary?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  title?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updated_at?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type KnowledgeSourcesResolvers<ContextType = Context, ParentType extends ResolversParentTypes['KnowledgeSources'] = ResolversParentTypes['KnowledgeSources']> = {
  capabilities?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  clients?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  jobOpenings?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  labels?: Resolver<ResolversTypes['SourceLabels'], ParentType, ContextType>;
  projects?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  saved?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  teamMembers?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
};

export type LocalizedTextResolvers<ContextType = Context, ParentType extends ResolversParentTypes['LocalizedText'] = ResolversParentTypes['LocalizedText']> = {
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  text?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type LumiReleaseResolvers<ContextType = Context, ParentType extends ResolversParentTypes['LumiRelease'] = ResolversParentTypes['LumiRelease']> = {
  publishedAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  version?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type LumiVersionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['LumiVersion'] = ResolversParentTypes['LumiVersion']> = {
  check?: Resolver<ResolversTypes['UpdateCheck'], ParentType, ContextType>;
  current?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  latest?: Resolver<Maybe<ResolversTypes['LumiRelease']>, ParentType, ContextType>;
  updateAvailable?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
};

export type McpAuditEventResolvers<ContextType = Context, ParentType extends ResolversParentTypes['McpAuditEvent'] = ResolversParentTypes['McpAuditEvent']> = {
  actorEmail?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  outcome?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  recordId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  recordType?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  tool?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ModelUsageResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ModelUsage'] = ResolversParentTypes['ModelUsage']> = {
  adminCalls?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  cacheWriteTokens?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  cachedInputTokens?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  calls?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  cost?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  inputTokens?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  model?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  outputTokens?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  purpose?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  reasoningTokens?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type MutationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  addCapabilitiesToProject?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationAddCapabilitiesToProjectArgs, 'capabilityIds' | 'projectId'>>;
  addCapabilitiesToTeamMember?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationAddCapabilitiesToTeamMemberArgs, 'input' | 'teamMemberId'>>;
  addEvent?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationAddEventArgs, 'input' | 'threadId'>>;
  addExperiencesToTeamMember?: Resolver<Maybe<Array<Maybe<ResolversTypes['ID']>>>, ParentType, ContextType, RequireFields<MutationAddExperiencesToTeamMemberArgs, 'input' | 'teamMemberId'>>;
  addTeamMembersToProject?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationAddTeamMembersToProjectArgs, 'projectId' | 'teamMembers'>>;
  changeAdminPassword?: Resolver<ResolversTypes['AdminAccount'], ParentType, ContextType, RequireFields<MutationChangeAdminPasswordArgs, 'currentPassword' | 'id' | 'newPassword'>>;
  clearProcessedWebsitePages?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationClearProcessedWebsitePagesArgs, 'id'>>;
  createAdminAccount?: Resolver<ResolversTypes['CreatedAdminAccount'], ParentType, ContextType, RequireFields<MutationCreateAdminAccountArgs, 'input'>>;
  createApiKey?: Resolver<ResolversTypes['CreatedApiKey'], ParentType, ContextType, RequireFields<MutationCreateApiKeyArgs, 'input'>>;
  createCapability?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType, RequireFields<MutationCreateCapabilityArgs, 'input'>>;
  createClient?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType, RequireFields<MutationCreateClientArgs, 'input'>>;
  createJobOpening?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType, RequireFields<MutationCreateJobOpeningArgs, 'input'>>;
  createProject?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType, RequireFields<MutationCreateProjectArgs, 'input'>>;
  createTeamMember?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType, RequireFields<MutationCreateTeamMemberArgs, 'input'>>;
  createThread?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  createUpload?: Resolver<ResolversTypes['CreateUploadResponse'], ParentType, ContextType, RequireFields<MutationCreateUploadArgs, 'contentType'>>;
  createWebsite?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType, RequireFields<MutationCreateWebsiteArgs, 'input'>>;
  deleteAdminAccount?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDeleteAdminAccountArgs, 'id'>>;
  deleteCapability?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationDeleteCapabilityArgs, 'id'>>;
  deleteClient?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationDeleteClientArgs, 'id'>>;
  deleteJobOpening?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationDeleteJobOpeningArgs, 'id'>>;
  deleteProject?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationDeleteProjectArgs, 'id'>>;
  deleteTeamMember?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationDeleteTeamMemberArgs, 'id'>>;
  deleteThread?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDeleteThreadArgs, 'id'>>;
  deleteWebsite?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationDeleteWebsiteArgs, 'id'>>;
  linkUploadToClientLogo?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationLinkUploadToClientLogoArgs, 'clientId' | 'key'>>;
  linkUploadToExperienceLogo?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationLinkUploadToExperienceLogoArgs, 'experienceId' | 'key'>>;
  linkUploadToProjectImage?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationLinkUploadToProjectImageArgs, 'key' | 'projectId'>>;
  linkUploadToTeamMemberPhoto?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationLinkUploadToTeamMemberPhotoArgs, 'key' | 'teamMemberId'>>;
  recordAdminUsage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationRecordAdminUsageArgs, 'input'>>;
  removeExperiences?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationRemoveExperiencesArgs, 'ids'>>;
  removeProjectCapabilities?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationRemoveProjectCapabilitiesArgs, 'ids' | 'projectId'>>;
  removeTeamMemberCapabilities?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationRemoveTeamMemberCapabilitiesArgs, 'ids' | 'teamMemberId'>>;
  removeTeamMembersFromProject?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationRemoveTeamMembersFromProjectArgs, 'projectId' | 'teamMemberIds'>>;
  retryEnquiryDelivery?: Resolver<ResolversTypes['Enquiry'], ParentType, ContextType, RequireFields<MutationRetryEnquiryDeliveryArgs, 'id'>>;
  revokeApiKey?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationRevokeApiKeyArgs, 'id'>>;
  saveTranslationDrafts?: Resolver<ResolversTypes['TranslationDraftsResult'], ParentType, ContextType, RequireFields<MutationSaveTranslationDraftsArgs, 'drafts' | 'language'>>;
  setupBusiness?: Resolver<ResolversTypes['BusinessSettings'], ParentType, ContextType, RequireFields<MutationSetupBusinessArgs, 'input'>>;
  updateBusinessSettings?: Resolver<ResolversTypes['BusinessSettings'], ParentType, ContextType, RequireFields<MutationUpdateBusinessSettingsArgs, 'input'>>;
  updateCapability?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationUpdateCapabilityArgs, 'id' | 'input'>>;
  updateClient?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationUpdateClientArgs, 'id' | 'input'>>;
  updateCompany?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationUpdateCompanyArgs, 'input'>>;
  updateExperiences?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationUpdateExperiencesArgs, 'input'>>;
  updateHandoffSettings?: Resolver<ResolversTypes['HandoffSettings'], ParentType, ContextType, RequireFields<MutationUpdateHandoffSettingsArgs, 'input'>>;
  updateJobOpening?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationUpdateJobOpeningArgs, 'id' | 'input'>>;
  updateProject?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationUpdateProjectArgs, 'id' | 'input'>>;
  updateProjectTeamMember?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationUpdateProjectTeamMemberArgs, 'projectId' | 'teamMembers'>>;
  updateResumeSettings?: Resolver<ResolversTypes['ResumeSettings'], ParentType, ContextType, RequireFields<MutationUpdateResumeSettingsArgs, 'input'>>;
  updateStructuredSources?: Resolver<ResolversTypes['KnowledgeSources'], ParentType, ContextType, RequireFields<MutationUpdateStructuredSourcesArgs, 'input'>>;
  updateTeamMember?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationUpdateTeamMemberArgs, 'id' | 'input'>>;
  updateTeamMemberCapabilities?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationUpdateTeamMemberCapabilitiesArgs, 'input' | 'teamMemberId'>>;
  updateThread?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationUpdateThreadArgs, 'id' | 'input'>>;
  updateWebsite?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationUpdateWebsiteArgs, 'id' | 'input'>>;
  updateWebsitePages?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationUpdateWebsitePagesArgs, 'id' | 'kind'>>;
  upsertAppointmentSettings?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationUpsertAppointmentSettingsArgs, 'data'>>;
  verifyAdminCredentials?: Resolver<Maybe<ResolversTypes['AdminAccount']>, ParentType, ContextType, RequireFields<MutationVerifyAdminCredentialsArgs, 'email' | 'password'>>;
};

export type ProjectResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Project'] = ResolversParentTypes['Project']> = {
  capabilities?: Resolver<Maybe<Array<Maybe<ResolversTypes['Capability']>>>, ParentType, ContextType>;
  client?: Resolver<Maybe<ResolversTypes['Client']>, ParentType, ContextType, RequireFields<ProjectClientArgs, 'includeUnpublished'>>;
  created_at?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  end_date?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  fallback_fields?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  image_key?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  industry?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  location?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  published?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  start_date?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  summary?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  teamMembers?: Resolver<Maybe<Array<Maybe<ResolversTypes['TeamMemberInProject']>>>, ParentType, ContextType, RequireFields<ProjectTeamMembersArgs, 'includeUnpublished'>>;
  translations?: Resolver<Array<ResolversTypes['ProjectTranslation']>, ParentType, ContextType>;
  type?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updated_at?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  url_slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  webpage?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type ProjectContributionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ProjectContribution'] = ResolversParentTypes['ProjectContribution']> = {
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  end_date?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  fallback_fields?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  project?: Resolver<ResolversTypes['Project'], ParentType, ContextType>;
  start_date?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  translations?: Resolver<Array<ResolversTypes['ProjectContributionTranslation']>, ParentType, ContextType>;
};

export type ProjectContributionTranslationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ProjectContributionTranslation'] = ResolversParentTypes['ProjectContributionTranslation']> = {
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  draft?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  outdated?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  updated_at?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ProjectTranslationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ProjectTranslation'] = ResolversParentTypes['ProjectTranslation']> = {
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  draft?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  industry?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  outdated?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  summary?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  type?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updated_at?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type PublicBusinessSettingsResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PublicBusinessSettings'] = ResolversParentTypes['PublicBusinessSettings']> = {
  assistantName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  avatarUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  businessName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  careersUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  contactEmail?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  contactPhone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  contactUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  defaultLanguage?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  greeting?: Resolver<Maybe<Array<ResolversTypes['LocalizedText']>>, ParentType, ContextType>;
  logoUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  primaryColor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  starters?: Resolver<Maybe<Array<ResolversTypes['BusinessStarter']>>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  websiteUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type PublicClientReferenceResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PublicClientReference'] = ResolversParentTypes['PublicClientReference']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  logo_url?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type PublicContributionProjectResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PublicContributionProject'] = ResolversParentTypes['PublicContributionProject']> = {
  client?: Resolver<Maybe<ResolversTypes['PublicClientReference']>, ParentType, ContextType>;
  fallback_fields?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type PublicExperienceResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PublicExperience'] = ResolversParentTypes['PublicExperience']> = {
  company?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  end_date?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  fallback_fields?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  location?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  logo_url?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  position?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  start_date?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type PublicProjectContributionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PublicProjectContribution'] = ResolversParentTypes['PublicProjectContribution']> = {
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  end_date?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  fallback_fields?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  project?: Resolver<ResolversTypes['PublicContributionProject'], ParentType, ContextType>;
  start_date?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type PublicTeamMemberCapabilityResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PublicTeamMemberCapability'] = ResolversParentTypes['PublicTeamMemberCapability']> = {
  fallback_fields?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  stars?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type PublicTeamMemberProfileResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PublicTeamMemberProfile'] = ResolversParentTypes['PublicTeamMemberProfile']> = {
  bio?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  capabilities?: Resolver<Array<ResolversTypes['PublicTeamMemberCapability']>, ParentType, ContextType>;
  capability_highlights?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  education?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  experiences?: Resolver<Array<ResolversTypes['PublicExperience']>, ParentType, ContextType>;
  fallback_fields?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  job_title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  profile_photo_url?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  project_contributions?: Resolver<Array<ResolversTypes['PublicProjectContribution']>, ParentType, ContextType>;
  webpage?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type PublishedCountResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PublishedCount'] = ResolversParentTypes['PublishedCount']> = {
  published?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type QueryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  adminAccount?: Resolver<Maybe<ResolversTypes['AdminAccount']>, ParentType, ContextType, RequireFields<QueryAdminAccountArgs, 'id'>>;
  adminAccounts?: Resolver<Array<ResolversTypes['AdminAccount']>, ParentType, ContextType>;
  apiKeys?: Resolver<Array<ResolversTypes['ApiKey']>, ParentType, ContextType>;
  businessSettings?: Resolver<Maybe<ResolversTypes['BusinessSettings']>, ParentType, ContextType>;
  calendar?: Resolver<Maybe<ResolversTypes['Calendar']>, ParentType, ContextType>;
  capabilities?: Resolver<Maybe<Array<Maybe<ResolversTypes['Capability']>>>, ParentType, ContextType, RequireFields<QueryCapabilitiesArgs, 'includeUnpublished'>>;
  capability?: Resolver<Maybe<ResolversTypes['Capability']>, ParentType, ContextType, RequireFields<QueryCapabilityArgs, 'id' | 'includeUnpublished'>>;
  client?: Resolver<Maybe<ResolversTypes['Client']>, ParentType, ContextType, RequireFields<QueryClientArgs, 'id' | 'includeUnpublished'>>;
  clientBySlug?: Resolver<Maybe<ResolversTypes['Client']>, ParentType, ContextType, RequireFields<QueryClientBySlugArgs, 'includeUnpublished' | 'url_slug'>>;
  clients?: Resolver<Maybe<Array<Maybe<ResolversTypes['Client']>>>, ParentType, ContextType, RequireFields<QueryClientsArgs, 'includeUnpublished'>>;
  company?: Resolver<Maybe<ResolversTypes['Company']>, ParentType, ContextType, Partial<QueryCompanyArgs>>;
  dashboard?: Resolver<ResolversTypes['Dashboard'], ParentType, ContextType, RequireFields<QueryDashboardArgs, 'days'>>;
  getDownloadUrl?: Resolver<Maybe<ResolversTypes['GetUploadResponse']>, ParentType, ContextType, RequireFields<QueryGetDownloadUrlArgs, 'key'>>;
  handoffSettings?: Resolver<ResolversTypes['HandoffSettings'], ParentType, ContextType>;
  hasAdminAccounts?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  jobOpening?: Resolver<Maybe<ResolversTypes['JobOpening']>, ParentType, ContextType, RequireFields<QueryJobOpeningArgs, 'id' | 'includeUnpublished'>>;
  jobOpeningBySlug?: Resolver<Maybe<ResolversTypes['JobOpening']>, ParentType, ContextType, RequireFields<QueryJobOpeningBySlugArgs, 'includeUnpublished' | 'url_slug'>>;
  jobOpenings?: Resolver<Maybe<Array<Maybe<ResolversTypes['JobOpening']>>>, ParentType, ContextType, RequireFields<QueryJobOpeningsArgs, 'includeUnpublished'>>;
  knowledgeSources?: Resolver<ResolversTypes['KnowledgeSources'], ParentType, ContextType>;
  lumiVersion?: Resolver<ResolversTypes['LumiVersion'], ParentType, ContextType>;
  mediaStorageConfigured?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  project?: Resolver<Maybe<ResolversTypes['Project']>, ParentType, ContextType, RequireFields<QueryProjectArgs, 'id' | 'includeUnpublished'>>;
  projectBySlug?: Resolver<Maybe<ResolversTypes['Project']>, ParentType, ContextType, RequireFields<QueryProjectBySlugArgs, 'includeUnpublished' | 'url_slug'>>;
  projects?: Resolver<Maybe<Array<Maybe<ResolversTypes['Project']>>>, ParentType, ContextType, RequireFields<QueryProjectsArgs, 'includeUnpublished'>>;
  publicBusinessSettings?: Resolver<Maybe<ResolversTypes['PublicBusinessSettings']>, ParentType, ContextType>;
  publicTeamMember?: Resolver<Maybe<ResolversTypes['PublicTeamMemberProfile']>, ParentType, ContextType, RequireFields<QueryPublicTeamMemberArgs, 'id'>>;
  resumeSettings?: Resolver<ResolversTypes['ResumeSettings'], ParentType, ContextType>;
  searchWebsitePages?: Resolver<Maybe<Array<Maybe<ResolversTypes['WebsitePageResult']>>>, ParentType, ContextType, RequireFields<QuerySearchWebsitePagesArgs, 'query'>>;
  teamMember?: Resolver<Maybe<ResolversTypes['TeamMember']>, ParentType, ContextType, RequireFields<QueryTeamMemberArgs, 'id' | 'includeUnpublished'>>;
  teamMemberBySlug?: Resolver<Maybe<ResolversTypes['TeamMember']>, ParentType, ContextType, RequireFields<QueryTeamMemberBySlugArgs, 'includeUnpublished' | 'url_slug'>>;
  teamMembers?: Resolver<Maybe<Array<Maybe<ResolversTypes['TeamMember']>>>, ParentType, ContextType, RequireFields<QueryTeamMembersArgs, 'includeUnpublished'>>;
  thread?: Resolver<Maybe<ResolversTypes['Thread']>, ParentType, ContextType, RequireFields<QueryThreadArgs, 'id'>>;
  threads?: Resolver<Array<ResolversTypes['Thread']>, ParentType, ContextType>;
  website?: Resolver<Maybe<ResolversTypes['Website']>, ParentType, ContextType, RequireFields<QueryWebsiteArgs, 'id'>>;
  websites?: Resolver<Maybe<Array<Maybe<ResolversTypes['Website']>>>, ParentType, ContextType>;
};

export type ResumeSettingsResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ResumeSettings'] = ResolversParentTypes['ResumeSettings']> = {
  accentColor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  enabled?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  footerText?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  gradientColor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  headerColor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  logoUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type SlotResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Slot'] = ResolversParentTypes['Slot']> = {
  end?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  start?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
};

export type SourceLabelResolvers<ContextType = Context, ParentType extends ResolversParentTypes['SourceLabel'] = ResolversParentTypes['SourceLabel']> = {
  plural?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  singular?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type SourceLabelsResolvers<ContextType = Context, ParentType extends ResolversParentTypes['SourceLabels'] = ResolversParentTypes['SourceLabels']> = {
  capabilities?: Resolver<ResolversTypes['SourceLabel'], ParentType, ContextType>;
  clients?: Resolver<ResolversTypes['SourceLabel'], ParentType, ContextType>;
  jobOpenings?: Resolver<ResolversTypes['SourceLabel'], ParentType, ContextType>;
  projects?: Resolver<ResolversTypes['SourceLabel'], ParentType, ContextType>;
  teamMembers?: Resolver<ResolversTypes['SourceLabel'], ParentType, ContextType>;
};

export type TeamMemberResolvers<ContextType = Context, ParentType extends ResolversParentTypes['TeamMember'] = ResolversParentTypes['TeamMember']> = {
  bio?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  capabilities?: Resolver<Maybe<Array<Maybe<ResolversTypes['TeamMemberCapability']>>>, ParentType, ContextType>;
  capability_highlights?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  created_at?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  education?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  experiences?: Resolver<Maybe<Array<Maybe<ResolversTypes['Experience']>>>, ParentType, ContextType>;
  fallback_fields?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  job_title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  profile_photo_key?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  project_contributions?: Resolver<Maybe<Array<Maybe<ResolversTypes['ProjectContribution']>>>, ParentType, ContextType, RequireFields<TeamMemberProject_ContributionsArgs, 'includeUnpublished'>>;
  published?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  translations?: Resolver<Array<ResolversTypes['TeamMemberTranslation']>, ParentType, ContextType>;
  updated_at?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  url_slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  webpage?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type TeamMemberCapabilityResolvers<ContextType = Context, ParentType extends ResolversParentTypes['TeamMemberCapability'] = ResolversParentTypes['TeamMemberCapability']> = {
  fallback_fields?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  stars?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type TeamMemberInProjectResolvers<ContextType = Context, ParentType extends ResolversParentTypes['TeamMemberInProject'] = ResolversParentTypes['TeamMemberInProject']> = {
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  end_date?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  fallback_fields?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  start_date?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  teamMember?: Resolver<Maybe<ResolversTypes['TeamMember']>, ParentType, ContextType>;
  translations?: Resolver<Array<ResolversTypes['ProjectContributionTranslation']>, ParentType, ContextType>;
};

export type TeamMemberTranslationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['TeamMemberTranslation'] = ResolversParentTypes['TeamMemberTranslation']> = {
  bio?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  capability_highlights?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  draft?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  education?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  job_title?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  language?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  outdated?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  updated_at?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ThreadResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Thread'] = ResolversParentTypes['Thread']> = {
  closed?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  cost?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  email?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  enquiries?: Resolver<Array<ResolversTypes['Enquiry']>, ParentType, ContextType>;
  enquiryFailed?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  pageUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  phone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  summary?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  topic?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  usage?: Resolver<Array<ResolversTypes['ModelUsage']>, ParentType, ContextType>;
};

export type TranslationDraftsResultResolvers<ContextType = Context, ParentType extends ResolversParentTypes['TranslationDraftsResult'] = ResolversParentTypes['TranslationDraftsResult']> = {
  saved?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  untranslated?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type WebsiteResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Website'] = ResolversParentTypes['Website']> = {
  created_at?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  exclude_paths?: Resolver<Maybe<Array<Maybe<ResolversTypes['String']>>>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  last_processed?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  latestCrawl?: Resolver<Maybe<ResolversTypes['WebsiteCrawl']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  sitemap?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updated_at?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  url?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type WebsiteCrawlResolvers<ContextType = Context, ParentType extends ResolversParentTypes['WebsiteCrawl'] = ResolversParentTypes['WebsiteCrawl']> = {
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  finishedAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  kind?: Resolver<ResolversTypes['WebsiteCrawlKind'], ParentType, ContextType>;
  pagesChecked?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  pagesOverLimit?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  pagesProcessed?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  pagesRemoved?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  pagesTotal?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  startedAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['WebsiteCrawlStatus'], ParentType, ContextType>;
};

export type WebsitePageResultResolvers<ContextType = Context, ParentType extends ResolversParentTypes['WebsitePageResult'] = ResolversParentTypes['WebsitePageResult']> = {
  documents?: Resolver<Maybe<Array<Maybe<ResolversTypes['Document']>>>, ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type Resolvers<ContextType = Context> = {
  AdminAccount?: AdminAccountResolvers<ContextType>;
  AllowedTime?: AllowedTimeResolvers<ContextType>;
  ApiKey?: ApiKeyResolvers<ContextType>;
  Availability?: AvailabilityResolvers<ContextType>;
  BookingSetting?: BookingSettingResolvers<ContextType>;
  BusinessSettings?: BusinessSettingsResolvers<ContextType>;
  BusinessStarter?: BusinessStarterResolvers<ContextType>;
  Calendar?: CalendarResolvers<ContextType>;
  Capability?: CapabilityResolvers<ContextType>;
  CapabilityTranslation?: CapabilityTranslationResolvers<ContextType>;
  Client?: ClientResolvers<ContextType>;
  ClientTranslation?: ClientTranslationResolvers<ContextType>;
  Company?: CompanyResolvers<ContextType>;
  CompanyTranslation?: CompanyTranslationResolvers<ContextType>;
  CreateUploadResponse?: CreateUploadResponseResolvers<ContextType>;
  CreatedAdminAccount?: CreatedAdminAccountResolvers<ContextType>;
  CreatedApiKey?: CreatedApiKeyResolvers<ContextType>;
  Dashboard?: DashboardResolvers<ContextType>;
  DashboardContent?: DashboardContentResolvers<ContextType>;
  DashboardDay?: DashboardDayResolvers<ContextType>;
  DashboardMcp?: DashboardMcpResolvers<ContextType>;
  DashboardWebsite?: DashboardWebsiteResolvers<ContextType>;
  DeliveryChannel?: DeliveryChannelResolvers<ContextType>;
  Document?: DocumentResolvers<ContextType>;
  Enquiry?: EnquiryResolvers<ContextType>;
  EnquiryAnswer?: EnquiryAnswerResolvers<ContextType>;
  EnquiryContactValue?: EnquiryContactValueResolvers<ContextType>;
  EnquiryDelivery?: EnquiryDeliveryResolvers<ContextType>;
  EnquiryFieldSetting?: EnquiryFieldSettingResolvers<ContextType>;
  Experience?: ExperienceResolvers<ContextType>;
  ExperienceTranslation?: ExperienceTranslationResolvers<ContextType>;
  GetUploadResponse?: GetUploadResponseResolvers<ContextType>;
  HandoffSettings?: HandoffSettingsResolvers<ContextType>;
  JSON?: GraphQLScalarType;
  JobOpening?: JobOpeningResolvers<ContextType>;
  JobOpeningTranslation?: JobOpeningTranslationResolvers<ContextType>;
  KnowledgeSources?: KnowledgeSourcesResolvers<ContextType>;
  LocalizedText?: LocalizedTextResolvers<ContextType>;
  LumiRelease?: LumiReleaseResolvers<ContextType>;
  LumiVersion?: LumiVersionResolvers<ContextType>;
  McpAuditEvent?: McpAuditEventResolvers<ContextType>;
  ModelUsage?: ModelUsageResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  Project?: ProjectResolvers<ContextType>;
  ProjectContribution?: ProjectContributionResolvers<ContextType>;
  ProjectContributionTranslation?: ProjectContributionTranslationResolvers<ContextType>;
  ProjectTranslation?: ProjectTranslationResolvers<ContextType>;
  PublicBusinessSettings?: PublicBusinessSettingsResolvers<ContextType>;
  PublicClientReference?: PublicClientReferenceResolvers<ContextType>;
  PublicContributionProject?: PublicContributionProjectResolvers<ContextType>;
  PublicExperience?: PublicExperienceResolvers<ContextType>;
  PublicProjectContribution?: PublicProjectContributionResolvers<ContextType>;
  PublicTeamMemberCapability?: PublicTeamMemberCapabilityResolvers<ContextType>;
  PublicTeamMemberProfile?: PublicTeamMemberProfileResolvers<ContextType>;
  PublishedCount?: PublishedCountResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  ResumeSettings?: ResumeSettingsResolvers<ContextType>;
  Slot?: SlotResolvers<ContextType>;
  SourceLabel?: SourceLabelResolvers<ContextType>;
  SourceLabels?: SourceLabelsResolvers<ContextType>;
  TeamMember?: TeamMemberResolvers<ContextType>;
  TeamMemberCapability?: TeamMemberCapabilityResolvers<ContextType>;
  TeamMemberInProject?: TeamMemberInProjectResolvers<ContextType>;
  TeamMemberTranslation?: TeamMemberTranslationResolvers<ContextType>;
  Thread?: ThreadResolvers<ContextType>;
  TranslationDraftsResult?: TranslationDraftsResultResolvers<ContextType>;
  Website?: WebsiteResolvers<ContextType>;
  WebsiteCrawl?: WebsiteCrawlResolvers<ContextType>;
  WebsitePageResult?: WebsitePageResultResolvers<ContextType>;
};

