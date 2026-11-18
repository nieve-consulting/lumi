import { requireInternal } from "@/apollo/access"
import type { BusinessStarter, BusinessStarterInput, FirstAdminInput, LocalizedTextInput, Resolvers } from "@/generated/graphql"
import { AdminAccountExistsError, parseFirstAdmin } from "@/services/adminAccounts"
import {
  BusinessAlreadySetUpError,
  BusinessNotSetUpError,
  getBusinessSettings,
  settingsOf,
  setupBusiness,
  updateBusinessSettings,
  type BusinessSettingsRecord,
} from "@/services/businessSettings"
import {
  BusinessSettingsError,
  parseBusinessSettings,
  type BusinessSettingsInput,
  type BusinessSettingsProblem,
  type LocalizedText,
  type StarterInput,
} from "@lumi/shared-contracts/business"
import { LANGUAGES } from "@lumi/shared-contracts/language"
import { GraphQLError } from "graphql"

import { asGraphQLError } from "../validation"

// The installation's business settings (src/services/businessSettings.ts). The web app checks admin access before calling
// businessSettings and updateBusinessSettings; setupBusiness is open to its public onboarding wizard, guarded only by there
// being no settings yet (and, for a first admin, by the web app's setup token). Generated API keys can't call setupBusiness

// Text by language as a list, in the order of LANGUAGES
const localizedList = (text: LocalizedText) => LANGUAGES.flatMap((language) => (text[language] ? [{ language, text: text[language] }] : []))

function starterOf({ icon, label, message }: StarterInput): BusinessStarter {
  return { icon: icon ?? null, label: localizedList(label), message: localizedList(message) }
}

function toBusinessSettings(record: BusinessSettingsRecord) {
  const settings = settingsOf(record)
  return {
    ...settings,
    starters: settings.starters?.map(starterOf) ?? null,
    greeting: settings.greeting ? localizedList(settings.greeting) : null,
    updatedAt: record.updated_at.toISOString(),
  }
}

// The public settings leave out the server-only agent fields
function toPublicBusinessSettings(record: BusinessSettingsRecord) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { agentDescription, agentGuidance, ...settings } = toBusinessSettings(record)
  return settings
}

// The GraphQL input as the settings parseBusinessSettings checks: starter and greeting texts become text by language. A language that
// isn't supported or is given twice is reported on its own field, with every problem parseBusinessSettings finds and those
// of the setup's first admin
function settingsInput(
  {
    starters,
    greeting,
    ...input
  }: { starters?: BusinessStarterInput[] | null; greeting?: LocalizedTextInput[] | null } & Omit<BusinessSettingsInput, "starters" | "greeting">,
  firstAdmin?: FirstAdminInput | null
) {
  const problems: BusinessSettingsProblem[] = []
  const localizedText = (entries: LocalizedTextInput[], field: string) => {
    const text: Record<string, string> = {}
    for (const { language, text: value } of entries) {
      if (!(LANGUAGES as readonly string[]).includes(language)) {
        problems.push({ field: `${field}.${language}`, message: `Choose one of ${LANGUAGES.join(", ")}` })
      } else if (language in text) {
        problems.push({ field: `${field}.${language}`, message: "Entered more than once" })
      } else {
        text[language] = value
      }
    }
    return text as LocalizedText
  }

  const settings: BusinessSettingsInput = {
    ...input,
    starters: starters?.map(({ icon, label, message }, index) => ({
      icon: icon as StarterInput["icon"],
      label: localizedText(label, `starters.${index}.label`),
      message: localizedText(message, `starters.${index}.message`),
    })),
    greeting: greeting && localizedText(greeting, "greeting"),
  }
  if (problems.length) {
    try {
      parseBusinessSettings(settings)
    } catch (error) {
      if (error instanceof BusinessSettingsError) problems.push(...error.problems)
    }
    throw new BusinessSettingsError([...problems, ...(firstAdmin ? parseFirstAdmin(firstAdmin).problems : [])])
  }

  return settings
}

// Problems with the settings list each field, for the form to show next to it
function asBusinessSettingsError(error: unknown): never {
  if (error instanceof BusinessSettingsError) {
    throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT", problems: error.problems } })
  }
  if (error instanceof BusinessAlreadySetUpError) {
    throw new GraphQLError(error.message, { extensions: { code: "ALREADY_SET_UP" } })
  }
  if (error instanceof BusinessNotSetUpError) {
    throw new GraphQLError(error.message, { extensions: { code: "NOT_SET_UP" } })
  }
  if (error instanceof AdminAccountExistsError) {
    throw new GraphQLError(error.message, { extensions: { code: "ADMIN_EXISTS" } })
  }
  asGraphQLError(error)
}

export const businessResolvers: Resolvers = {
  Query: {
    publicBusinessSettings: async (_, __, context) => {
      const record = await getBusinessSettings(context.drizzle)
      return record && toPublicBusinessSettings(record)
    },
    businessSettings: async (_, __, context) => {
      const record = await getBusinessSettings(context.drizzle)
      return record && toBusinessSettings(record)
    },
  },
  Mutation: {
    setupBusiness: async (_, { input, firstAdmin }, context) => {
      // It may create the first administrator, so only the admin interface may call it (src/apollo/access.ts)
      requireInternal(context)
      try {
        return toBusinessSettings(await setupBusiness(context.drizzle, settingsInput(input, firstAdmin), firstAdmin ?? undefined))
      } catch (error) {
        asBusinessSettingsError(error)
      }
    },
    updateBusinessSettings: async (_, { input }, context) => {
      try {
        return toBusinessSettings(await updateBusinessSettings(context.drizzle, settingsInput(input)))
      } catch (error) {
        asBusinessSettingsError(error)
      }
    },
  },
}
