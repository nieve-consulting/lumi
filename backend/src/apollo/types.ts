import type { ApiAccess } from "@/authorizers/apiAccess"
import type { DbType } from "@db/db"

import type AwsDataSource from "./sources/aws"
import type DbDataSource from "./sources/dbDataSource"
import type GCalendarSource from "./sources/gCalendar"
import type S3Source from "./sources/s3Source"
import type EmbeddingsSource from "./sources/vectorStore"

// Who the request comes from, by its API key (role, and apiKeyId for a generated key: src/authorizers/apiAccess.ts), which
// src/apollo/access.ts enforces
export interface Context extends ApiAccess {
  // For the shared entity services (src/services)
  drizzle: DbType
  dataSources: { db: DbDataSource; s3: S3Source; embeddings: EmbeddingsSource; gCalendar: GCalendarSource; aws: AwsDataSource }
}
