import type DbDataSource from "@/apollo/sources/dbDataSource"
import { Resolvers } from "@/generated/graphql"

type ThreadRow = NonNullable<Awaited<ReturnType<DbDataSource["getThread"]>>>

// The total is unknown while some calls have no price, rather than a total that leaves them out
export const toThread = (thread: ThreadRow) => ({
  ...thread,
  createdAt: thread.created_at.toISOString(),
  pageUrl: thread.page_url,
  cost: thread.unpriced_calls > 0 ? null : thread.cost,
})

export const threadsResolvers: Resolvers = {
  Query: {
    thread: (_, { id }, context) => context.dataSources.db.getThread(id).then((thread) => (thread ? toThread(thread) : null)),
    threads: (_, __, context) => context.dataSources.db.listThreads().then((threads) => threads.map(toThread)),
  },
  Thread: {
    usage: (thread, _, context) => context.dataSources.db.getThreadUsage(thread.id),
  },
  Mutation: {
    createThread: async (_, __, context) => {
      const result = await context.dataSources.db.createThread()
      return result.id
    },
    deleteThread: async (_, { id }, context) => {
      const result = await context.dataSources.db.deleteThread(id)
      return result
    },
    updateThread: async (_, { id, input }, context) => {
      const result = await context.dataSources.db.updateThread(id, input)
      return result
    },
  },
}
