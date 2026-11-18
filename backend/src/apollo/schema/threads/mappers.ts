import { Thread } from "@/generated/graphql"

// usage and the enquiries are resolved per thread (src/apollo/schema/handoff), so the thread queries do not return them
export type ThreadMapper = Omit<Thread, "usage" | "enquiries" | "enquiryFailed">
