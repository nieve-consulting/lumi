import { z } from "zod"

// The id argument of the detail tools: records' ids are uuids, and anything else fails as invalid input the model can correct
// rather than as a database error. Checked with a refinement, not z.uuid(), so the tool definitions don't grow a uuid pattern
// that would lengthen the cached prompt prefix
export const recordIdSchema = () =>
  z.string().refine((id) => z.uuid().safeParse(id).success, "Not a valid id: use an id exactly as a list tool returned it")
