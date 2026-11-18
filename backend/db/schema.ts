import type { LocalizedText, StarterInput } from "@lumi/shared-contracts/business"
import type {
  Booking,
  DeliveryChannelConfig,
  DeliveryChannelType,
  DeliveryStatus,
  EnquiryField,
  EnquiryFieldModes,
} from "@lumi/shared-contracts/handoff"
import { JOB_WORK_MODES, type SourceLabels } from "@lumi/shared-contracts/knowledge"
import type { Language } from "@lumi/shared-contracts/language"
import { relations, sql, type AnyColumn } from "drizzle-orm"
import {
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  vector,
} from "drizzle-orm/pg-core"

//
// Uploads
//

export const uploadState = pgEnum("uploadState", ["CREATED", "UPLOADED"])

export const uploads = pgTable("uploads", {
  key: uuid("key")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  created_at: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
  content_type: varchar("content_type", { length: 256 }).notNull(),
  state: uploadState("state").notNull().default("CREATED"),
})

//
// Translations
//

// Record content written for readers is stored per language in a <entity>_translations table, one row per record and
// language. English (DEFAULT_LANGUAGE) is required for every record, other languages are optional. Names of people and
// companies, slugs, URLs, contact details, dates, images, publication status and relations stay on the record, shared by
// every language; project and capability names are translated.
// A translation may cover only some fields: null means the field is not translated yet and reads fall back to its English
// text, while an empty string leaves it empty in that language. English sets every field its record requires
// updated_at tells when the translation was last saved; source_version tells whether it may be outdated; draft whether it
// awaits review
const translationColumns = () => ({
  // A language from LANGUAGES in @lumi/shared-contracts/language, kept as text so adding one needs no schema change
  language: varchar("language", { length: 16 }).notNull().$type<Language>(),
  created_at: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
  updated_at: timestamp("updated_at")
    .notNull()
    .default(sql`now()`)
    .$onUpdate(() => new Date()),
  // Version (versionOf) of the English content the translation was written from, null in English. The translation may be
  // outdated when English's current version differs. Unlike updated_at, it ignores saves that leave English unchanged
  source_version: varchar("source_version", { length: 32 }),
  // An AI translation saved for review (bulk translation). Reads skip it and fall back to English until the team saves the
  // translation, which clears it. Always false in English
  draft: boolean("draft").notNull().default(false),
})

// Languages are lowercase ISO 639 codes, so a language can't be stored under two spellings such as en and EN
const languageCheck = (table: string, language: AnyColumn) => check(`${table}_language_check`, sql`${language} ~ '^[a-z]{2,3}$'`)

// A field the record requires, which only English (DEFAULT_LANGUAGE) must set
const englishRequired = (table: string, language: AnyColumn, field: AnyColumn) =>
  check(`${table}_english_required`, sql`${language} <> 'en' or ${field} is not null`)

//
// Business settings
//

// The business the installation represents (BusinessSettingsInput in @lumi/shared-contracts/business): set by the onboarding
// wizard, edited by admins. A single row, keyed by id true, so it can only be inserted once; until it exists the installation
// isn't set up. Stored as entered once validated: trimmed, with unset fields null and defaults left to the readers. Every
// field but the agent ones is public
export const businessSettings = pgTable(
  "business_settings",
  {
    id: boolean("id").primaryKey().default(true),
    created_at: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    updated_at: timestamp("updated_at")
      .notNull()
      .default(sql`now()`)
      .$onUpdate(() => new Date()),
    business_name: text("business_name").notNull(),
    website_url: text("website_url"),
    careers_url: text("careers_url"),
    contact_url: text("contact_url"),
    contact_email: text("contact_email"),
    contact_phone: text("contact_phone"),
    assistant_name: text("assistant_name"),
    avatar_url: text("avatar_url"),
    logo_url: text("logo_url"),
    primary_color: text("primary_color"),
    default_language: varchar("default_language", { length: 16 }).$type<Language>(),
    // Null shows the chat's built-in starters, an empty list none
    starters: jsonb("starters").$type<StarterInput[]>(),
    // The assistant's first message by language. Null uses the built-in greeting
    greeting: jsonb("greeting").$type<LocalizedText>(),
    // Server-only: the agent's instructions, never sent to visitors
    agent_description: text("agent_description"),
    agent_guidance: text("agent_guidance"),
  },
  (table) => [check("business_settings_singleton", sql`${table.id} = true`)]
)

//
// Handoff settings
//

// How conversations are handed to the business (HandoffSettingsInput in @lumi/shared-contracts/handoff): the qualification
// questions, the enquiry form's fields, the booking destination and the channels that deliver enquiries. A single row like
// business_settings, edited by admins; until it exists DEFAULT_HANDOFF_CONFIG applies (no booking, no enquiries). Stored as
// parseHandoffSettings returns it. delivery_channels are server-only: they hold recipients, webhook URLs and signing secrets
export const handoffSettings = pgTable(
  "handoff_settings",
  {
    id: boolean("id").primaryKey().default(true),
    created_at: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    updated_at: timestamp("updated_at")
      .notNull()
      .default(sql`now()`)
      .$onUpdate(() => new Date()),
    qualification_questions: jsonb("qualification_questions").notNull().$type<string[]>(),
    enquiry_fields: jsonb("enquiry_fields").notNull().$type<EnquiryFieldModes>(),
    booking: jsonb("booking").notNull().$type<Booking>(),
    enquiry_enabled: boolean("enquiry_enabled").notNull().default(false),
    // Server-only, see above
    delivery_channels: jsonb("delivery_channels").notNull().$type<DeliveryChannelConfig[]>(),
  },
  (table) => [check("handoff_settings_singleton", sql`${table.id} = true`)]
)

//
// Resume settings
//

// Whether the installation offers team member resumes, and the logo, colours and footer text of the PDF (ResumeSettingsInput in
// @lumi/shared-contracts/resume). A single row like business_settings, edited by admins; until it exists
// DEFAULT_RESUME_SETTINGS apply (resumes on, neutral colours, no logo, no footer text). Stored as entered once validated: trimmed, colours as
// lowercase #rrggbb, unset fields null so the readers apply the defaults. Every field is public
export const resumeSettings = pgTable(
  "resume_settings",
  {
    id: boolean("id").primaryKey().default(true),
    created_at: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    updated_at: timestamp("updated_at")
      .notNull()
      .default(sql`now()`)
      .$onUpdate(() => new Date()),
    enabled: boolean("enabled").notNull().default(true),
    logo_url: text("logo_url"),
    header_color: text("header_color"),
    accent_color: text("accent_color"),
    gradient_color: text("gradient_color"),
    // Null leaves the footer band out
    footer_text: text("footer_text"),
  },
  (table) => [check("resume_settings_singleton", sql`${table.id} = true`)]
)

//
// Admin accounts
//

// The admins of an installation that signs them in with an email and a password (ADMIN_AUTH_PROVIDER=local on the web app),
// src/services/adminAccounts.ts. Unused with Google Workspace sign-in. All admins are equal; there is always at least one
// once the first is created. Passwords are only stored as scrypt hashes that carry their own salt and parameters
export const adminAccounts = pgTable(
  "admin_accounts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    created_at: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    updated_at: timestamp("updated_at")
      .notNull()
      .default(sql`now()`)
      .$onUpdate(() => new Date()),
    // Trimmed and lowercase (normalizeAdminEmail in @lumi/shared-contracts/adminAccounts)
    email: text("email").notNull(),
    name: text("name"),
    password_hash: text("password_hash").notNull(),
    // Set for a temporary password, which the admin must replace before using the admin
    must_change_password: boolean("must_change_password").notNull().default(false),
    last_sign_in_at: timestamp("last_sign_in_at"),
    // When the password was last set. The web app keeps it in each session and ends sessions from before a change
    password_changed_at: timestamp("password_changed_at")
      .notNull()
      .default(sql`now()`),
  },
  (table) => [uniqueIndex("admin_accounts_email_idx").on(table.email)]
)

// Failed admin sign-ins (and current password checks) in fixed 15-minute windows, per email and per client IP, both hashed
// so the table holds no addresses. Counted in Postgres so every Lambda container shares them
export const adminSignInFailures = pgTable(
  "admin_sign_in_failures",
  {
    bucket: text("bucket").notNull(),
    window_start: timestamp("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.bucket, table.window_start] })]
)

//
// API keys
//

// What a generated API key may do (src/apollo/access.ts): read published records and public business data, or everything but
// managing API keys
export const apiKeyAccess = pgEnum("apiKeyAccess", ["read_only", "admin"])

// API keys admins generate for other systems, such as a website, to call the GraphQL API and render PDFs,
// src/services/apiKeys.ts. The installation's own key (LUMI_API_KEY) is not one of them. Only a SHA-256 hash of the secret is
// stored, enough for a random 256-bit secret; it is shown once, when created. A revoked key is kept, with revoked_at, and
// refused from then on
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    created_at: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    name: text("name").notNull(),
    access: apiKeyAccess("access").notNull(),
    // Hex SHA-256 of the secret, which requests are matched by
    secret_hash: text("secret_hash").notNull(),
    // The secret's last 4 characters, to tell keys apart
    last_characters: text("last_characters").notNull(),
    // Email of the admin who created it, when known
    created_by: text("created_by"),
    // Recorded at most about once a minute
    last_used_at: timestamp("last_used_at"),
    revoked_at: timestamp("revoked_at"),
  },
  (table) => [uniqueIndex("api_keys_secret_hash_idx").on(table.secret_hash)]
)

//
// Company
//

export const company = pgTable("company", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  created_at: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
  updated_at: timestamp("updated_at")
    .notNull()
    .default(sql`now()`)
    .$onUpdate(() => new Date()),
  location: varchar("location", { length: 256 }).notNull(),
  phone: varchar("phone", { length: 256 }).notNull(),
  email: varchar("email", { length: 256 }).notNull(),
  webpage: varchar("url", { length: 256 }),
})

export const companyRelations = relations(company, ({ many }) => ({ translations: many(companyTranslations) }))

export const companyTranslations = pgTable(
  "company_translations",
  {
    company_id: uuid("company_id")
      .references(() => company.id, { onDelete: "cascade" })
      .notNull(),
    ...translationColumns(),
    founding_story: text("founding_story"),
    values: text("values"),
    mission: text("mission"),
    vision: text("vision"),
  },
  (table) => [primaryKey({ columns: [table.company_id, table.language] }), languageCheck("company_translations", table.language)]
)

export const companyTranslationRelations = relations(companyTranslations, ({ one }) => ({
  company: one(company, { fields: [companyTranslations.company_id], references: [company.id] }),
}))

//
// Team members
//

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    created_at: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    updated_at: timestamp("updated_at")
      .notNull()
      .default(sql`now()`)
      .$onUpdate(() => new Date()),
    name: varchar("name", { length: 256 }).notNull(),
    // Approved for external disclosure (public chatbot and anonymous MCP reads). Unpublish team members who leave the business
    published: boolean("published").notNull().default(false),
    url_slug: varchar("url_slug", { length: 256 }).notNull().unique(),
    profile_photo_key: uuid("profile_photo_key").references(() => uploads.key, { onDelete: "set null" }),
    webpage: varchar("url", { length: 256 }),
  },
  (table) => [uniqueIndex("url_slug_index").on(table.url_slug)]
)

export const teamMemberRelations = relations(teamMembers, ({ many, one }) => ({
  projectTeamMembers: many(projectTeamMembers),
  experiences: many(experience),
  capabilities: many(teamMemberCapabilities),
  profilePhoto: one(uploads, { fields: [teamMembers.profile_photo_key], references: [uploads.key] }),
  translations: many(teamMemberTranslations),
}))

export const teamMemberTranslations = pgTable(
  "team_member_translations",
  {
    team_member_id: uuid("team_member_id")
      .references(() => teamMembers.id, { onDelete: "cascade" })
      .notNull(),
    ...translationColumns(),
    job_title: varchar("job_title", { length: 256 }),
    capability_highlights: text("capability_highlights"),
    bio: text("bio"),
    education: text("education"),
  },
  (table) => [
    primaryKey({ columns: [table.team_member_id, table.language] }),
    languageCheck("team_member_translations", table.language),
    englishRequired("team_member_translations", table.language, table.job_title),
  ]
)

export const teamMemberTranslationRelations = relations(teamMemberTranslations, ({ one }) => ({
  teamMember: one(teamMembers, { fields: [teamMemberTranslations.team_member_id], references: [teamMembers.id] }),
}))

export const projectLocationEnum = pgEnum("projectLocation", ["REMOTE", "HYBRID", "ONSITE"])

//
// Experience
//

export const experience = pgTable("experience", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  created_at: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
  updated_at: timestamp("updated_at")
    .notNull()
    .default(sql`now()`)
    .$onUpdate(() => new Date()),
  company: varchar("name", { length: 256 }).notNull(),
  logo_key: uuid("logo_key").references(() => uploads.key, { onDelete: "set null" }),
  location: varchar("location", { length: 256 }).notNull(),
  start_date: timestamp("start_date").notNull(),
  end_date: timestamp("end_date"),
  team_member_id: uuid("team_member_id").references(() => teamMembers.id, { onDelete: "cascade" }),
})

export const experienceRelations = relations(experience, ({ one, many }) => ({
  teamMember: one(teamMembers, { fields: [experience.team_member_id], references: [teamMembers.id] }),
  logo: one(uploads, { fields: [experience.logo_key], references: [uploads.key] }),
  translations: many(experienceTranslations),
}))

export const experienceTranslations = pgTable(
  "experience_translations",
  {
    experience_id: uuid("experience_id")
      .references(() => experience.id, { onDelete: "cascade" })
      .notNull(),
    ...translationColumns(),
    position: varchar("position", { length: 256 }),
    description: text("description"),
  },
  (table) => [
    primaryKey({ columns: [table.experience_id, table.language] }),
    languageCheck("experience_translations", table.language),
    englishRequired("experience_translations", table.language, table.position),
  ]
)

export const experienceTranslationRelations = relations(experienceTranslations, ({ one }) => ({
  experience: one(experience, { fields: [experienceTranslations.experience_id], references: [experience.id] }),
}))

//
// Capabilities
//

export const capabilities = pgTable("capabilities", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  created_at: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
  updated_at: timestamp("updated_at")
    .notNull()
    .default(sql`now()`)
    .$onUpdate(() => new Date()),
})

export const capabilityRelations = relations(capabilities, ({ many }) => ({
  teamMembers: many(teamMemberCapabilities),
  projects: many(projectCapabilities),
  translations: many(capabilityTranslations),
}))

export const capabilityTranslations = pgTable(
  "capability_translations",
  {
    capability_id: uuid("capability_id")
      .references(() => capabilities.id, { onDelete: "cascade" })
      .notNull(),
    ...translationColumns(),
    name: varchar("name", { length: 256 }),
    description: text("description"),
  },
  (table) => [
    primaryKey({ columns: [table.capability_id, table.language] }),
    languageCheck("capability_translations", table.language),
    englishRequired("capability_translations", table.language, table.name),
  ]
)

export const capabilityTranslationRelations = relations(capabilityTranslations, ({ one }) => ({
  capability: one(capabilities, { fields: [capabilityTranslations.capability_id], references: [capabilities.id] }),
}))

export const teamMemberCapabilities = pgTable(
  "team_member_capabilities",
  {
    created_at: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    updated_at: timestamp("updated_at")
      .notNull()
      .default(sql`now()`)
      .$onUpdate(() => new Date()),
    stars: smallint("stars").notNull().default(1),
    team_member_id: uuid("team_member_id").references(() => teamMembers.id, { onDelete: "cascade" }),
    capability_id: uuid("capability_id").references(() => capabilities.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.team_member_id, table.capability_id] })]
)

export const projectCapabilities = pgTable(
  "project_capabilities",
  {
    created_at: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    updated_at: timestamp("updated_at")
      .notNull()
      .default(sql`now()`)
      .$onUpdate(() => new Date()),
    project_id: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    capability_id: uuid("capability_id").references(() => capabilities.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.project_id, table.capability_id] })]
)

export const teamMemberCapabilitiesRelations = relations(teamMemberCapabilities, ({ one }) => ({
  teamMember: one(teamMembers, { fields: [teamMemberCapabilities.team_member_id], references: [teamMembers.id] }),
  capability: one(capabilities, { fields: [teamMemberCapabilities.capability_id], references: [capabilities.id] }),
}))

export const projectCapabilitiesRelations = relations(projectCapabilities, ({ one }) => ({
  project: one(projects, { fields: [projectCapabilities.project_id], references: [projects.id] }),
  capability: one(capabilities, { fields: [projectCapabilities.capability_id], references: [capabilities.id] }),
}))

//
// Clients
//

export const clients = pgTable("clients", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  created_at: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
  updated_at: timestamp("updated_at")
    .notNull()
    .default(sql`now()`)
    .$onUpdate(() => new Date()),
  name: varchar("name", { length: 256 }).notNull(),
  url_slug: varchar("url_slug", { length: 256 }).notNull().unique(),
  internal_webpage: varchar("interal_webpage", { length: 256 }),
  client_website: varchar("client_website", { length: 256 }),
  // Approved for external disclosure (public chatbot and anonymous MCP reads)
  published: boolean("published").notNull().default(false),
  logo_key: uuid("logo_key").references(() => uploads.key, { onDelete: "set null" }),
})

export const clientRelations = relations(clients, ({ many, one }) => ({
  projects: many(projects),
  logo: one(uploads, { fields: [clients.logo_key], references: [uploads.key] }),
  translations: many(clientTranslations),
}))

export const clientTranslations = pgTable(
  "client_translations",
  {
    client_id: uuid("client_id")
      .references(() => clients.id, { onDelete: "cascade" })
      .notNull(),
    ...translationColumns(),
    summary: text("summary"),
    description: text("description"),
  },
  (table) => [
    primaryKey({ columns: [table.client_id, table.language] }),
    languageCheck("client_translations", table.language),
    englishRequired("client_translations", table.language, table.summary),
  ]
)

export const clientTranslationRelations = relations(clientTranslations, ({ one }) => ({
  client: one(clients, { fields: [clientTranslations.client_id], references: [clients.id] }),
}))

//
// Projects
//

export const projects = pgTable("projects", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  created_at: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
  updated_at: timestamp("updated_at")
    .notNull()
    .default(sql`now()`)
    .$onUpdate(() => new Date()),
  url_slug: varchar("url_slug", { length: 256 }).notNull().unique(),
  start_date: timestamp("start_date").notNull(),
  end_date: timestamp("end_date"),
  location: projectLocationEnum("location").notNull(),
  image_key: uuid("image_key").references(() => uploads.key, { onDelete: "set null" }),
  client_id: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  webpage: varchar("url", { length: 256 }),
  // Approved for external disclosure (public chatbot and anonymous MCP reads)
  published: boolean("published").notNull().default(false),
})

export const projectRelations = relations(projects, ({ many, one }) => ({
  projectTeamMembers: many(projectTeamMembers),
  capabilities: many(projectCapabilities),
  client: one(clients, { fields: [projects.client_id], references: [clients.id] }),
  image: one(uploads, { fields: [projects.image_key], references: [uploads.key] }),
  translations: many(projectTranslations),
}))

export const projectTranslations = pgTable(
  "project_translations",
  {
    project_id: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    ...translationColumns(),
    name: varchar("name", { length: 256 }),
    summary: text("summary"),
    description: text("description"),
    industry: varchar("industry", { length: 50 }),
    type: varchar("type", { length: 50 }),
  },
  (table) => [
    primaryKey({ columns: [table.project_id, table.language] }),
    languageCheck("project_translations", table.language),
    englishRequired("project_translations", table.language, table.name),
  ]
)

export const projectTranslationRelations = relations(projectTranslations, ({ one }) => ({
  project: one(projects, { fields: [projectTranslations.project_id], references: [projects.id] }),
}))

export const projectTeamMembers = pgTable(
  "project_team_members",
  {
    created_at: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    updated_at: timestamp("updated_at")
      .notNull()
      .default(sql`now()`)
      .$onUpdate(() => new Date()),
    project_id: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    team_member_id: uuid("team_member_id")
      .references(() => teamMembers.id, { onDelete: "cascade" })
      .notNull(),
    start_date: timestamp("start_date")
      .notNull()
      .default(sql`now()`),
    end_date: timestamp("end_date"),
  },
  (table) => [primaryKey({ columns: [table.team_member_id, table.project_id] })]
)

export const projectTeamMembersRelations = relations(projectTeamMembers, ({ one, many }) => ({
  project: one(projects, { fields: [projectTeamMembers.project_id], references: [projects.id] }),
  teamMember: one(teamMembers, { fields: [projectTeamMembers.team_member_id], references: [teamMembers.id] }),
  translations: many(projectTeamMemberTranslations),
}))

// A team member's contribution to a project
export const projectTeamMemberTranslations = pgTable(
  "project_team_member_translations",
  {
    team_member_id: uuid("team_member_id").notNull(),
    project_id: uuid("project_id").notNull(),
    ...translationColumns(),
    description: text("description"),
  },
  (table) => [
    // Named explicitly: the generated names exceed PostgreSQL's 63-character limit
    primaryKey({ name: "project_team_member_translations_pk", columns: [table.team_member_id, table.project_id, table.language] }),
    foreignKey({
      name: "project_team_member_translations_project_team_members_fk",
      columns: [table.team_member_id, table.project_id],
      foreignColumns: [projectTeamMembers.team_member_id, projectTeamMembers.project_id],
    }).onDelete("cascade"),
    languageCheck("project_team_member_translations", table.language),
  ]
)

export const projectTeamMemberTranslationRelations = relations(projectTeamMemberTranslations, ({ one }) => ({
  projectTeamMember: one(projectTeamMembers, {
    fields: [projectTeamMemberTranslations.team_member_id, projectTeamMemberTranslations.project_id],
    references: [projectTeamMembers.team_member_id, projectTeamMembers.project_id],
  }),
}))

//
// Job openings
//

// Where a job opening's work happens. A mode added to JOB_WORK_MODES needs a migration
export const jobWorkModeEnum = pgEnum("jobWorkMode", JOB_WORK_MODES)

// The positions the business recruits for, managed in Lumi like the other structured sources
export const jobOpenings = pgTable("job_openings", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  created_at: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
  updated_at: timestamp("updated_at")
    .notNull()
    .default(sql`now()`)
    .$onUpdate(() => new Date()),
  url_slug: varchar("url_slug", { length: 256 }).notNull().unique(),
  // Where the work is based, e.g. "Madrid, Spain". Shared by every language
  location: varchar("location", { length: 256 }).notNull(),
  work_mode: jobWorkModeEnum("work_mode").notNull(),
  // Where candidates apply; without one, the careers page from the business settings
  application_url: varchar("application_url", { length: 256 }),
  posted_at: timestamp("posted_at").notNull(),
  // Approved for external disclosure (public chatbot, public GraphQL queries and anonymous MCP reads)
  published: boolean("published").notNull().default(false),
})

export const jobOpeningRelations = relations(jobOpenings, ({ many }) => ({ translations: many(jobOpeningTranslations) }))

// The English summary is required too, which the services and the admin forms check
export const jobOpeningTranslations = pgTable(
  "job_opening_translations",
  {
    job_opening_id: uuid("job_opening_id")
      .references(() => jobOpenings.id, { onDelete: "cascade" })
      .notNull(),
    ...translationColumns(),
    title: varchar("title", { length: 256 }),
    summary: text("summary"),
    // Markdown
    description: text("description"),
  },
  (table) => [
    primaryKey({ columns: [table.job_opening_id, table.language] }),
    languageCheck("job_opening_translations", table.language),
    englishRequired("job_opening_translations", table.language, table.title),
  ]
)

export const jobOpeningTranslationRelations = relations(jobOpeningTranslations, ({ one }) => ({
  jobOpening: one(jobOpenings, { fields: [jobOpeningTranslations.job_opening_id], references: [jobOpenings.id] }),
}))

// Websites sources

// Websites

export const websites = pgTable("websites", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  created_at: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
  updated_at: timestamp("updated_at")
    .notNull()
    .default(sql`now()`),
  last_processed: timestamp("last_processed"),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  url: text("url").notNull(),
  sitemap: text("sitemap").notNull(),
  exclude_paths: text("exclude_paths").array(),
})

export const websiteRelations = relations(websites, ({ many }) => ({ pages: many(websitePages) }))

// Website pages

export const websitePages = pgTable("website_pages", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  created_at: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
  website_id: uuid("website_id").references(() => websites.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  title: text("title"),
  last_processed: timestamp("last_processed"),
  // SHA-256 of the page's extracted text when it was last indexed. A page the sitemap gives no last modified date for is
  // fetched once per completed crawl, and only embedded again when its text changed
  content_hash: text("content_hash"),
})

export const websitePagesRelations = relations(websitePages, ({ one, many }) => ({
  website: one(websites, { fields: [websitePages.website_id], references: [websites.id] }),
}))

// Website crawls, each run of the crawler on a website and how far it got, so the websites page shows the latest one's
// progress and outcome

// Update Pages crawls new and modified pages; Re-process crawls them all once they were cleared
export const websiteCrawlKind = pgEnum("websiteCrawlKind", ["update", "reprocess"])

// Queued until the crawler holds the website's crawl lock; running until it completes, stops before the Lambda timeout or fails.
// A crawl that never started or was killed keeps its queued or running status: reads tell them apart by its age and the lock
export const websiteCrawlStatus = pgEnum("websiteCrawlStatus", ["queued", "running", "completed", "stopped", "failed"])

export const websiteCrawls = pgTable(
  "website_crawls",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    created_at: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    website_id: uuid("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    kind: websiteCrawlKind("kind").notNull().default("update"),
    // The admin who started the crawl, null for a run of the crawler over every website
    admin_email: text("admin_email"),
    status: websiteCrawlStatus("status").notNull().default("queued"),
    // Sitemap pages to check, after exclusions. Null until the sitemap is read
    pages_total: integer("pages_total"),
    // Sitemap pages checked so far, modified or not, and those crawled again because they were new or modified
    pages_checked: integer("pages_checked").notNull().default(0),
    pages_processed: integer("pages_processed").notNull().default(0),
    // Pages removed with their search content because the sitemap no longer lists them, they are now excluded, they are gone
    // (401, 403, 404 or 410) or they can't be indexed. Only a completed crawl removes pages it didn't find in the sitemap
    pages_removed: integer("pages_removed").notNull().default(0),
    // Sitemap pages left out because the crawl reached WEBSITE_CRAWL_LIMITS.maxPages
    pages_over_limit: integer("pages_over_limit").notNull().default(0),
    // Why the crawl failed, written for the admin
    error: text("error"),
    started_at: timestamp("started_at"),
    // When it completed (the website's last_processed), stopped or failed
    finished_at: timestamp("finished_at"),
  },
  // The websites page reads each website's latest crawl
  (table) => [index("website_crawls_website_id_created_at_idx").on(table.website_id, table.created_at)]
)

// Website page vectors, the chunks of the pages that website search finds. LumiVectorStore (PGVectorStore) reads and writes
// them by these column names
export const websitePageVectors = pgTable(
  "website_page_vectors",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    content: text("content"),
    // The chunk's page as webpageId
    metadata: jsonb("metadata"),
    // Typed with the dimensions of the embedding model (VECTOR_EMBEDDINGS in LumiVectorStore), which the HNSW index needs
    vector: vector("vector", { dimensions: 1536 }),
    // The page in metadata, as a foreign key: deleting a page, or its website, deletes its vectors
    webpage_id: uuid("webpage_id")
      .generatedAlwaysAs(sql`(metadata->>'webpageId')::uuid`)
      .references(() => websitePages.id, { onDelete: "cascade" }),
  },
  (table) => [
    // Website search orders the vectors by cosine distance to the query's
    index("website_page_vectors_vector_idx").using("hnsw", table.vector.op("vector_cosine_ops")).with({ m: 16, ef_construction: 64 }),
    // A page is crawled again by deleting its vectors
    index("website_page_vectors_webpage_id_idx").on(table.webpage_id),
  ]
)

//
// Knowledge
//

// Which structured sources the chat, the MCP server and the admin navigation use, and their labels (StructuredSources and
// SourceLabels in @lumi/shared-contracts/knowledge). A single row like business_settings; until an admin saves it, a source
// is on when it has a published record
export const knowledgeSettings = pgTable(
  "knowledge_settings",
  {
    id: boolean("id").primaryKey().default(true),
    created_at: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    updated_at: timestamp("updated_at")
      .notNull()
      .default(sql`now()`)
      .$onUpdate(() => new Date()),
    team_members_enabled: boolean("team_members_enabled").notNull(),
    projects_enabled: boolean("projects_enabled").notNull(),
    clients_enabled: boolean("clients_enabled").notNull(),
    capabilities_enabled: boolean("capabilities_enabled").notNull(),
    // Off for the records saved before job openings were a source, whose admins never saw the switch
    job_openings_enabled: boolean("job_openings_enabled").notNull().default(false),
    // Only the labels an admin changed from DEFAULT_SOURCE_LABELS; readers fill in the rest
    labels: jsonb("labels").$type<Partial<SourceLabels>>().notNull().default({}),
  },
  (table) => [check("knowledge_settings_singleton", sql`${table.id} = true`)]
)

// Chat History

/// Threads

export const threads = pgTable(
  "threads",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    created_at: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    closed: boolean("closed").notNull().default(false),
    topic: text("topic"),
    summary: text("summary"),
    email: text("email"),
    phone: text("phone"),
    name: text("name"),
    // The page the visitor started the conversation on, e.g. the website page embedding the chat, normalized by the agents API
    // (normalizePageUrl in shared-contracts) and only on the installation's own sites. Recorded once when the thread is
    // created; null when unknown
    page_url: text("page_url"),
    // Total cost in USD of the thread's priced model calls, kept up to date as thread_usage rows are added. Null until usage is recorded
    cost: doublePrecision("cost"),
    // Model calls recorded without a cost because their model has no price: while there are any, the total is incomplete
    unpriced_calls: integer("unpriced_calls").notNull().default(0),
    // When the visitor last sent a message, a booking or an enquiry, in UTC: stamped as the request starts, before it saves
    // anything else, so conversation retention never deletes a conversation with a turn in progress
    // (src/services/conversationDeletion.ts). Null until the first one after it was added
    last_activity_at: timestamp("last_activity_at"),
  },
  // The admin dashboard reads the conversations of a date range
  (table) => [index("threads_created_at_idx").on(table.created_at)]
)

/// Enquiries a visitor sent from a conversation's handoff card (src/services/enquiries.ts), with the contact fields the form
/// asked for. Kept with the thread and deleted with it. The submission id is made by the visitor's form, so resending the
/// same submission never stores a second enquiry

export const enquiries = pgTable(
  "enquiries",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    created_at: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    thread_id: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    submission_id: uuid("submission_id").notNull(),
    // Only the fields the form showed and the visitor filled in
    contact: jsonb("contact").notNull().$type<Partial<Record<EnquiryField, string>>>(),
    // Every question the form showed, with an empty answer where the visitor left it out
    qualification: jsonb("qualification").notNull().$type<{ question: string; answer: string }[]>(),
    message: text("message"),
    topic: text("topic"),
  },
  // Also serves the reads of a thread's enquiries
  (table) => [uniqueIndex("enquiries_thread_submission_idx").on(table.thread_id, table.submission_id)]
)

/// Each delivery channel's delivery of an enquiry. The channel key is the one in handoff_settings.delivery_channels, so a
/// retry only sends where the enquiry wasn't delivered. Pending while it is being sent; a pending delivery that hasn't moved
/// for a few minutes was interrupted and reads as failed

export const enquiryDeliveries = pgTable(
  "enquiry_deliveries",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    enquiry_id: uuid("enquiry_id")
      .notNull()
      .references(() => enquiries.id, { onDelete: "cascade" }),
    channel_key: text("channel_key").notNull(),
    channel_type: text("channel_type").notNull().$type<DeliveryChannelType>(),
    status: text("status").notNull().default("pending").$type<DeliveryStatus>(),
    attempts: integer("attempts").notNull().default(0),
    // Why the latest attempt failed, shortened
    last_error: text("last_error"),
    delivered_at: timestamp("delivered_at"),
    updated_at: timestamp("updated_at")
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex("enquiry_deliveries_enquiry_channel_idx").on(table.enquiry_id, table.channel_key),
    check("enquiry_deliveries_status", sql`${table.status} in ('pending', 'delivered', 'failed')`),
  ]
)

// Daily public-conversation spending, independent of visitor records. Deleting a conversation must not give back its
// spending allowance. Only the UTC day and total cost are retained: no conversation ids, model calls or personal data.
export const dailyConversationSpend = pgTable("daily_conversation_spend", {
  day: date("day").primaryKey(),
  cost: doublePrecision("cost").notNull().default(0),
})

/// Thread usage: token usage and cost of each model call made for a thread (agent turns, helpers and summaries)

export const threadUsage = pgTable(
  "thread_usage",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    created_at: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    thread_id: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    // What the call was for (ModelPurpose in src/ai/models.ts), e.g. chat for the agent replies
    purpose: text("purpose").notNull(),
    // Token counts as OpenAI reports them: cached and cache write tokens are part of the input tokens, reasoning tokens part of the output tokens
    input_tokens: integer("input_tokens").notNull(),
    cached_input_tokens: integer("cached_input_tokens").notNull().default(0),
    cache_write_tokens: integer("cache_write_tokens").notNull().default(0),
    output_tokens: integer("output_tokens").notNull(),
    reasoning_tokens: integer("reasoning_tokens").notNull().default(0),
    // Cost in USD at the model's prices when the call was made, null when the model has no price
    cost: doublePrecision("cost"),
  },
  (table) => [index("thread_usage_thread_id_idx").on(table.thread_id), index("thread_usage_created_at_idx").on(table.created_at)]
)

// Admin Usage

/// Token usage and cost of each model call the team makes in the admin (record translation, the editor's writing assistant),
/// recorded by the frontend through the recordAdminUsage mutation. Same token columns as thread_usage

export const adminUsage = pgTable(
  "admin_usage",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    created_at: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    // The admin who made the call
    admin_email: text("admin_email").notNull(),
    model: text("model").notNull(),
    // What the call was for, as its Langfuse trace name: translate-record or improve-text; crawl-website for the embeddings of
    // a website crawl the admin started
    purpose: text("purpose").notNull(),
    // Token counts as OpenAI reports them: cached and cache write tokens are part of the input tokens, reasoning tokens part of the output tokens
    input_tokens: integer("input_tokens").notNull(),
    cached_input_tokens: integer("cached_input_tokens").notNull().default(0),
    cache_write_tokens: integer("cache_write_tokens").notNull().default(0),
    output_tokens: integer("output_tokens").notNull(),
    reasoning_tokens: integer("reasoning_tokens").notNull().default(0),
    // Cost in USD at the model's prices when the call was made, null when the model has no price
    cost: doublePrecision("cost"),
  },
  // The admin dashboard reads the calls of a date range
  (table) => [index("admin_usage_created_at_idx").on(table.created_at)]
)

// Appointment Settings

export const appointment_settings = pgTable("appointment_settings", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  created_at: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
  updated_at: timestamp("updated_at")
    .notNull()
    .default(sql`now()`)
    .$onUpdate(() => new Date()),
  meeting_duration: integer("meeting_duration_mins").notNull(),
  allowed_times: jsonb("allowed_times").notNull().$type<{ hour: number; minutes: number }[]>(),
  time_before_slot: integer("min_available_time_before_slot").notNull(),
  allowed_days: integer("allowed_days").array().notNull(),
  same_day_min_hours: integer("same_day_min_hours").notNull(),
  max_days_out: integer("max_days_out").notNull(),
  host_timezone: text("host_timezone").notNull(),
  calendars: text("calendars").array().notNull(),
  booking_email: text("booking_email").notNull(),
})

// MCP server (src/mcp): OAuth authorization server state, idempotent writes, audit trail and rate limits

/// OAuth clients registered through Dynamic Client Registration. Clients using a Client ID Metadata Document are not stored

export const oauthClients = pgTable("oauth_clients", {
  client_id: text("client_id").primaryKey(),
  created_at: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
  client_name: text("client_name"),
  redirect_uris: text("redirect_uris").array().notNull(),
})

/// Authorization codes, stored hashed. A code is redeemed once: used_at is set atomically when it is exchanged

export const oauthAuthorizationCodes = pgTable("oauth_authorization_codes", {
  code_hash: text("code_hash").primaryKey(),
  created_at: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
  expires_at: timestamp("expires_at").notNull(),
  used_at: timestamp("used_at"),
  client_id: text("client_id").notNull(),
  redirect_uri: text("redirect_uri").notNull(),
  code_challenge: text("code_challenge").notNull(),
  scopes: text("scopes").array().notNull(),
  resource: text("resource").notNull(),
  // Google account (sub) and email of the signed-in team member
  user_sub: text("user_sub").notNull(),
  user_email: text("user_email").notNull(),
  user_name: text("user_name"),
  // Refresh token family started by this code, revoked if the code is replayed
  family_id: uuid("family_id").notNull(),
  // Lumi admin account sign-in (src/mcp/oauth/team.ts): when the password was verified
  signed_in_at: timestamp("signed_in_at"),
})

/// Refresh tokens, stored hashed and rotated on every use. Reusing a rotated token revokes its whole family

export const oauthRefreshTokens = pgTable(
  "oauth_refresh_tokens",
  {
    token_hash: text("token_hash").primaryKey(),
    created_at: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    expires_at: timestamp("expires_at").notNull(),
    used_at: timestamp("used_at"),
    revoked_at: timestamp("revoked_at"),
    family_id: uuid("family_id").notNull(),
    client_id: text("client_id").notNull(),
    scopes: text("scopes").array().notNull(),
    resource: text("resource").notNull(),
    user_sub: text("user_sub").notNull(),
    user_email: text("user_email").notNull(),
    user_name: text("user_name"),
    // Lumi admin account sign-in (src/mcp/oauth/team.ts): when the password was verified, carried to each rotated token
    signed_in_at: timestamp("signed_in_at"),
  },
  (table) => [index("oauth_refresh_tokens_family_id_idx").on(table.family_id)]
)

/// Outcome of each idempotent write, per actor, tool and key. Saved in the write's own transaction

export const mcpIdempotencyKeys = pgTable(
  "mcp_idempotency_keys",
  {
    actor: text("actor").notNull(),
    tool: text("tool").notNull(),
    key: text("key").notNull(),
    created_at: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    // Hash of the canonical request payload: the same key with another payload is a conflict
    request_hash: text("request_hash").notNull(),
    response: jsonb("response").notNull(),
  },
  (table) => [primaryKey({ columns: [table.actor, table.tool, table.key] })]
)

/// Audit trail of protected writes: who called which tool on which record, and the outcome. No tokens or record content

export const mcpAuditEvents = pgTable(
  "mcp_audit_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    created_at: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
    actor_sub: text("actor_sub").notNull(),
    actor_email: text("actor_email").notNull(),
    client_id: text("client_id"),
    tool: text("tool").notNull(),
    record_type: text("record_type"),
    record_id: text("record_id"),
    // "success" or the error code
    outcome: text("outcome").notNull(),
    // Non-sensitive context such as the source URL of a project created from an article
    details: jsonb("details"),
  },
  (table) => [index("mcp_audit_events_created_at_idx").on(table.created_at)]
)

/// Fixed-window request counters per caller (user or IP address)

export const mcpRateLimits = pgTable(
  "mcp_rate_limits",
  {
    bucket: text("bucket").notNull(),
    window_start: timestamp("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.bucket, table.window_start] })]
)
