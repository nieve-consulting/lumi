import WidgetChat from "@/components/Chat/WidgetChat"

import packageJon from "../../../../package.json"

const version = packageJon.version
const commitId = process.env.COMMIT_ID?.substring(0, 7) || process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || "dev"

type SearchParams = Promise<{ initialPageTitle?: string }>

export default async function Page(props: { searchParams: SearchParams }) {
  const { initialPageTitle } = await props.searchParams
  return <WidgetChat className="h-full" version={version} commitId={commitId} initialPageTitle={initialPageTitle} />
}
