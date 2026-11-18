import "dotenv/config"

import { startStandaloneServer } from "@apollo/server/standalone"
import { db, pool } from "@db/db"

import server from "../server"
import AwsDataSource from "../sources/aws"
import DbDataSource from "../sources/dbDataSource"
import GCalendarSource from "../sources/gCalendar"
import S3Source from "../sources/s3Source"
import EmbeddingSource from "../sources/vectorStore"

;(async () => {
  const { url } = await startStandaloneServer(server, {
    listen: { port: 4000, path: "graphql" },
    // Local development has no authorizer: every request has the internal key's access
    context: async () => ({
      role: "internal" as const,
      drizzle: db,
      dataSources: {
        db: new DbDataSource(db),
        s3: new S3Source(),
        embeddings: new EmbeddingSource(pool),
        gCalendar: new GCalendarSource(),
        aws: new AwsDataSource(),
      },
    }),
  })
  console.log(`🚀  Server ready at: ${url}graphql`)
})()
