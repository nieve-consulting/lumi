import { COMMANDS, validateConfig, type Command } from "./config"

// Entry point of the backend container image (backend/Dockerfile): `<command> [arguments]`. Each command checks its
// configuration first, and exits with every problem when it is incomplete

const USAGE = `Usage: <command> [arguments]

Services:
  api                          GraphQL API (POST /graphql) and PDF service (POST /pdf), port 4000
  agents                       Streaming agents API (/agents/*, /admin/*), port 4200
  worker                       Website crawls (POST /crawls), the weekly checkpoint cleanup and, with
                               CONVERSATION_RETENTION_DAYS, the daily deletion of inactive conversations, port 4500
  mcp                          MCP server and its OAuth authorization server (/mcp, /oauth/*, /.well-known/oauth-*), port 4300

One-off:
  migrate                      Apply the database schema and checkpointer migrations
  admin-reset <email> [--name "Name"]
                               Create an admin account or reset its password to a temporary one
  checkpoint-cleanup [--apply] Report (or with --apply, delete) checkpoint data chats no longer need
  status                       Report the version, the schema's migrations and what the installation holds, and ask
                               GitHub's API for the latest release unless LUMI_UPDATE_CHECK=off
  export [--include-secrets] [--without-media]
                               Write the business's settings, knowledge and images to stdout as JSON (run with -T)
  import [--dry-run]           Import an export from stdin into a fresh installation of the same version (run with -T)
  delete-conversations [--thread <id>]... [--email <address>] [--older-than <days> | --before <YYYY-MM-DD>] [--apply]
                               Report (or with --apply, delete) visitor conversations and their enquiries

Each one-off command describes itself with --help.

The services answer GET /health. Configuration comes from environment variables; see the installation guide.`

async function run(command: Command, args: string[]): Promise<number | undefined> {
  switch (command) {
    case "api":
      await (await import("./api")).startApi()
      return
    case "agents":
      await (await import("./agents")).startAgents()
      return
    case "worker":
      await (await import("./worker")).startWorker()
      return
    case "mcp":
      await (await import("./mcp")).startMcp()
      return
    case "migrate":
      return (await import("./oneOff")).migrate()
    case "admin-reset":
      return (await import("./oneOff")).adminReset(args)
    case "checkpoint-cleanup":
      return (await import("./oneOff")).checkpointCleanup(args)
    case "delete-conversations":
      return (await import("./oneOff")).deleteConversations(args)
    case "status":
      return (await import("./status")).status(args)
    case "export":
      return (await import("./businessExport")).exportBusiness(args)
    case "import":
      return (await import("./businessExport")).importBusiness(args)
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2)

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(USAGE)
    return
  }
  if (!(COMMANDS as readonly string[]).includes(command)) {
    console.error(`${command ? `Unknown command "${command}"` : "No command given"}.\n\n${USAGE}`)
    process.exit(2)
  }

  // export writes its document to stdout, so everything it and the code it runs log goes to stderr
  if (command === "export") {
    console.log = console.error
    console.info = console.error
    console.debug = console.error
  }

  // A command's own help needs no configuration
  if (!args.includes("--help") && !args.includes("-h")) {
    validateConfig(command as Command)
  }

  const exitCode = await run(command as Command, args)
  if (exitCode !== undefined) process.exit(exitCode)
}

main().catch((error: unknown) => {
  console.error("Lumi failed to start:", error)
  process.exit(1)
})
