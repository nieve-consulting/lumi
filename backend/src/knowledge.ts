import type { Queryable } from "@/services/db"
import { readKnowledgeSources } from "@/services/knowledgeSettings"
import { inSentence, SOURCE_KEYS, sourcesInUse, type KnowledgeSources, type SourceKey } from "@lumi/shared-contracts/knowledge"

// The knowledge sources the chat and the MCP server answer from, as the agents read them: the structured sources an admin
// turned on and their labels (see src/services/knowledgeSettings.ts), or until then those with a published record.
// The website and public knowledge articles are always searched.
//
// Kept in memory per process for a short time like the business and handoff settings (src/business.ts, src/handoff.ts), so an
// admin's edit, or a first record published while the sources aren't saved, reaches running agents within CACHE_TTL_MS.
// While the sources stay the same every read returns the same object, so the tools bound and the system prompt built from it
// (and the MCP server's tool definitions) stay byte-identical and keep OpenAI's prompt cache

const CACHE_TTL_MS = 30_000

let cached: { sources: KnowledgeSources; expiresAt: number } | undefined
// Concurrent reads of an expired cache share one query
let loading: Promise<KnowledgeSources> | undefined

const sameSources = (a: KnowledgeSources, b: KnowledgeSources) =>
  SOURCE_KEYS.every((key) => a[key] === b[key] && a.labels[key].singular === b.labels[key].singular && a.labels[key].plural === b.labels[key].plural)

async function load(db: Queryable) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { saved, ...read } = await readKnowledgeSources(db)
  const effective = sourcesInUse(read)
  const sources = cached && sameSources(cached.sources, effective) ? cached.sources : effective
  cached = { sources, expiresAt: Date.now() + CACHE_TTL_MS }
  return sources
}

export function knowledgeSources(db: Queryable): Promise<KnowledgeSources> {
  if (cached && Date.now() < cached.expiresAt) return Promise.resolve(cached.sources)

  loading ??= load(db).finally(() => {
    loading = undefined
  })
  return loading
}

// How the chat's and the MCP server's English text names a source, from its labels: inside a sentence (inSentence, e.g.
// "our consultants"), with an indefinite article, and as written to start a sentence
export type SourceTerms = { singular: string; plural: string; aSingular: string; Singular: string; Plural: string }

// "a" or "an" before a word, by its first letter: right for the usual labels, if not for every English word
const withArticle = (word: string) => `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`

export function sourceTerms({ labels }: KnowledgeSources): Record<SourceKey, SourceTerms> {
  return Object.fromEntries(
    SOURCE_KEYS.map((key) => {
      const { singular, plural } = labels[key]
      return [
        key,
        {
          singular: inSentence(singular),
          plural: inSentence(plural),
          aSingular: withArticle(inSentence(singular)),
          Singular: singular,
          Plural: plural,
        },
      ]
    })
  ) as Record<SourceKey, SourceTerms>
}

// "a, b and c", or with another last conjunction ("a, b or c")
export const listed = (items: string[], conjunction = "and") =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1)}` : (items[0] ?? "")
