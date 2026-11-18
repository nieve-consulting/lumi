import { businessName, possessive } from "@/business"
import { knowledgeSources, listed, sourceTerms } from "@/knowledge"
import { resumesOffered } from "@/resume"
import { publicContext } from "@/services/context"
import { ServiceError } from "@/services/errors"
import type { DbType } from "@db/db"
import type { KnowledgeSources } from "@lumi/shared-contracts/knowledge"
import { createMcpHandler, McpServer, type AuthInfo, type CallToolResult } from "@modelcontextprotocol/server"
import { z } from "zod"

import { teamAccess } from "./auth"
import { SERVER_ICONS } from "./branding"
import { CONTRACT_VERSION, SCOPES } from "./config"
import { publicReadTools } from "./tools/publicReads"
import { teamReadTools } from "./tools/teamReads"
import type { LumiTool, ToolContext } from "./tools/types"
import { writeTools } from "./tools/writes"

// Lumi's MCP server: a thin adapter over the shared entity services (src/services), the same ones Lumi's website chatbot
// calls directly. Stateless: a fresh server serves each HTTP request

// Names only the structured sources that are on, by their labels, and how the generic tool and field names map to them
function instructions({ businessName, knowledge, terms }: ToolContext) {
  const sources = [
    { key: "projects", generic: "project" },
    { key: "teamMembers", generic: "team_member" },
    { key: "clients", generic: "client" },
    { key: "capabilities", generic: "capability" },
    { key: "jobOpenings", generic: "job_opening" },
  ] as const
  const on = sources.filter(({ key }) => knowledge[key])
  const holds = on.map(({ key }) => (key === "clients" ? `${terms.clients.plural} (the customers ${businessName} works for)` : terms[key].plural))
  // Labels that differ from the generic names, e.g. "team_member means a consultant"
  const renamed = on.filter(({ generic, key }) => generic.replace("_", " ") !== terms[key].singular)
  const naming = renamed.length
    ? `\n- Tool and field names use generic terms: ${listed(renamed.map(({ generic, key }) => `${generic} means ${terms[key].aSingular}`))}.`
    : ""

  const records = holds.length ? `${possessive(businessName)} ${listed(holds)}, and ` : ""

  return `Lumi holds ${records}the company's own information (founding story, values, mission, vision and contact details).${naming}
- get_* tools need no sign-in and only return information approved for public disclosure. admin_* tools and all writes need an account on ${possessive(businessName)} team.
- Before creating or linking records, search for existing ones with the admin_ tools and use their ids; never guess ids. When several records could match, ask the user which one they mean.
- Never invent facts, dates, ratings or ids. Ask the user for required values that are missing.
- Writes need an idempotency_key: a new one per change, the same one only to retry the same call. Updates need expected_version from the latest read; on a conflict, read the record again and review the changes with the user.
- Report a change as done only when the write tool succeeded. Only publish_record makes a record public: call it only when the user explicitly asks to publish.
Contract version ${CONTRACT_VERSION}.`
}

// ChatGPT reads the auth schemes of each tool from securitySchemes, also mirrored in _meta for other clients
function securitySchemes(tool: LumiTool) {
  if (tool.access === "public") return [{ type: "noauth" }]
  return [{ type: "oauth2", scopes: [tool.access === "write" ? SCOPES.write : SCOPES.read] }]
}

type ObjectJsonSchema = { type: "object"; [keyword: string]: unknown }

function jsonSchema(schema: z.ZodType, io: "input" | "output") {
  // The dialect keyword is left out, as in the SDK's own tool list
  const converted = z.toJSONSchema(schema, { io }) as ObjectJsonSchema
  delete converted.$schema
  return converted
}

function toolListEntry(tool: LumiTool) {
  const schemes = securitySchemes(tool)
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: jsonSchema(tool.input, "input"),
    outputSchema: jsonSchema(tool.output, "output"),
    annotations: { title: tool.title, ...tool.annotations },
    securitySchemes: schemes,
    _meta: { securitySchemes: schemes },
  }
}

type Definitions = {
  businessName: string
  knowledge: KnowledgeSources
  resumes: boolean
  instructions: string
  tools: LumiTool[]
  toolList: { tools: ReturnType<typeof toolListEntry>[] }
}

let definitions: Definitions | undefined

// The instructions and every tool, in a fixed order, for the installation's business name (NEUTRAL_BUSINESS_NAME before it
// is set up), knowledge sources and resume switch: the tools of a source that is off aren't registered, the labels name the
// records, and team members only come with a resume while resumes are offered. All are read from the settings
// src/business.ts, src/knowledge.ts and src/resume.ts cache, the sources as the same object while they don't change, so the
// definitions are only built again after an edit rather than for every request
async function definitionsFor(db: DbType): Promise<Definitions> {
  const [name, knowledge, resumes] = await Promise.all([businessName(db), knowledgeSources(db), resumesOffered(db)])
  if (definitions?.businessName !== name || definitions.knowledge !== knowledge || definitions.resumes !== resumes) {
    const context: ToolContext = { businessName: name, knowledge, terms: sourceTerms(knowledge), resumes }
    const tools = [...publicReadTools(context), ...teamReadTools(context), ...writeTools(context)]
    definitions = {
      businessName: name,
      knowledge,
      resumes,
      instructions: instructions(context),
      tools,
      toolList: { tools: tools.map(toolListEntry) },
    }
  }
  return definitions
}

function errorResult(code: string, message: string, details?: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ error: { code, message, ...(details && { details }) } }) }], isError: true }
}

async function runTool(db: DbType, tool: LumiTool, input: unknown, authInfo: AuthInfo | undefined): Promise<CallToolResult> {
  try {
    let ctx
    if (tool.access === "public") {
      // Public tools ignore any credentials, so signing in never widens what they return
      ctx = publicContext(db)
    } else {
      const access = await teamAccess(db, authInfo, tool.access)
      if (access.result) return access.result
      ctx = access.ctx
    }

    const structuredContent = (await tool.run(ctx, input as never)) as Record<string, unknown>
    return { content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent }
  } catch (error) {
    if (error instanceof ServiceError) return errorResult(error.code, error.message, error.details)

    console.error(`[MCP]: Tool ${tool.name} failed`, error)
    return errorResult("internal_error", "Lumi could not complete this request. Nothing was changed if it was a write; try again later.")
  }
}

function createServer(db: DbType, authInfo: AuthInfo | undefined, { instructions, tools, toolList }: Definitions) {
  const server = new McpServer({ name: "lumi", title: "Lumi", version: CONTRACT_VERSION, icons: SERVER_ICONS }, { instructions })

  tools.forEach((tool, index) => {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        outputSchema: tool.output,
        annotations: tool.annotations,
        _meta: toolList.tools[index]._meta,
      },
      (input) => runTool(db, tool, input, authInfo)
    )
  })

  // The SDK's tool list has no field for securitySchemes, so the list is served from the same definitions with it added
  server.server.removeRequestHandler("tools/list")
  server.server.setRequestHandler("tools/list", () => toolList)

  return server
}

// Serves one MCP request (Streamable HTTP, stateless). Tools emit no progress notifications, so each answer is a single message
export async function serveMcp(db: DbType, request: Request, authInfo: AuthInfo | undefined) {
  const definitions = await definitionsFor(db)
  const handler = createMcpHandler(() => createServer(db, authInfo, definitions), {
    maxRequestBodySize: 512 * 1024,
    onerror: (error) => console.warn("[MCP]: Request error:", error.message),
  })

  return handler.fetch(request, { authInfo })
}
