import path from "node:path"
import process from "node:process"
import { DEFAULT_LANGUAGE } from "@lumi/shared-contracts/language"
import dotenv from "dotenv"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { contentSql, saveContent, splitContent } from "../src/services/translations"
import * as schema from "./schema"

// Seeds a development database with sample clients, projects, capabilities and team members.
// Safe to run more than once: records are matched by url_slug (capabilities by name) and updated in place.

// Get .env file path from CLI args (e.g., tsx db/seed.ts .env.local)
const envPath = process.argv[2] || ".env"
const result = dotenv.config({ path: path.resolve(process.cwd(), "db", envPath) })

if (result.error) {
  console.error("Error loading .env file:", result.error)
  process.exit(1)
}

const { DB_HOST, DB_USER, DB_PORT, DB_PASSWORD, DB_NAME, DB_SSL, ENVIRONMENT = "development" } = process.env

if (ENVIRONMENT !== "development") {
  console.error(`Refusing to seed: ENVIRONMENT is "${ENVIRONMENT}", seeding only runs against development databases.`)
  process.exit(1)
}

const CAPABILITIES = [
  { name: "TypeScript", description: "Typed JavaScript for web and backend development" },
  { name: "React", description: "Component-based UI development for web applications" },
  { name: "Node.js", description: "Server-side JavaScript runtime for APIs and services" },
  { name: "Python", description: "Data processing, machine learning and backend services" },
  { name: "AWS", description: "Cloud infrastructure, serverless and managed services on Amazon Web Services" },
  { name: "IoT", description: "Connected devices, sensors and telemetry with MQTT and edge gateways" },
  { name: "LangChain", description: "Building LLM-powered agents and retrieval pipelines" },
  { name: "PostgreSQL", description: "Relational data modeling, performance tuning and pgvector" },
  { name: "Machine Learning", description: "Training and deploying predictive models" },
]

const CLIENTS = [
  {
    url_slug: "valle-verde-farms",
    name: "Valle Verde Farms",
    client_website: "https://valleverde.example.com",
    summary: "Agricultural cooperative managing irrigated farmland across several regions.",
    description:
      "Valle Verde Farms is a cooperative of family farms that grows fruit and vegetables on irrigated land. They wanted to reduce water usage and get real-time visibility into field conditions.",
  },
  {
    url_slug: "helio-logistics",
    name: "Helio Logistics",
    client_website: "https://helio-logistics.example.com",
    summary: "Regional logistics company operating a fleet of delivery trucks and warehouses.",
    description:
      "Helio Logistics runs last-mile and regional deliveries with a fleet of over 200 vehicles. They work with us to modernize fleet operations and customer service.",
  },
]

const TEAM_MEMBERS = [
  {
    url_slug: "laura-martin",
    name: "Laura Martín",
    job_title: "Senior Full-Stack Engineer",
    capability_highlights: "TypeScript, React, Node.js, LangChain",
    bio: "Laura builds web platforms end to end, from data models to polished interfaces. Lately she has focused on bringing LLM-powered assistants into production products.",
    education: "MSc in Computer Science",
    capabilities: { TypeScript: 5, React: 5, "Node.js": 4, LangChain: 4, PostgreSQL: 3 },
  },
  {
    url_slug: "javier-ortega",
    name: "Javier Ortega",
    job_title: "IoT & Cloud Architect",
    capability_highlights: "IoT, AWS, Python, Machine Learning",
    bio: "Javier designs connected-device platforms and the cloud backends behind them. He has led sensor deployments in agriculture and industrial settings.",
    education: "BSc in Telecommunications Engineering",
    capabilities: { IoT: 5, AWS: 5, Python: 4, "Machine Learning": 3, PostgreSQL: 3 },
  },
]

const PROJECTS = [
  {
    url_slug: "smart-irrigation-platform",
    name: "Smart Irrigation Platform",
    client: "valle-verde-farms",
    location: "HYBRID" as const,
    industry: "Agriculture",
    type: "IoT Platform",
    start_date: new Date("2025-03-01"),
    end_date: new Date("2025-11-30"),
    summary: "Soil-moisture sensors and automated irrigation scheduling that cut water usage by 30%.",
    description:
      "We deployed a network of soil-moisture and weather sensors across the cooperative's fields, streamed their readings to AWS and built a dashboard that schedules irrigation automatically based on field conditions and forecasts.",
    capabilities: ["IoT", "AWS", "Python", "React"],
    teamMembers: [
      {
        slug: "javier-ortega",
        description: "Designed the sensor network and the AWS IoT backend.",
        start_date: new Date("2025-03-01"),
        end_date: new Date("2025-11-30"),
      },
      {
        slug: "laura-martin",
        description: "Built the irrigation dashboard and scheduling interface.",
        start_date: new Date("2025-05-01"),
        end_date: new Date("2025-11-30"),
      },
    ],
  },
  {
    url_slug: "fleet-telemetry-dashboard",
    name: "Fleet Telemetry Dashboard",
    client: "helio-logistics",
    location: "REMOTE" as const,
    industry: "Logistics",
    type: "Data Platform",
    start_date: new Date("2025-06-01"),
    end_date: null,
    summary: "Real-time vehicle telemetry and route analytics for a fleet of 200+ trucks.",
    description:
      "An ongoing platform that collects GPS and engine telemetry from every vehicle, stores it in PostgreSQL and gives dispatchers live maps, alerts and route efficiency reports.",
    capabilities: ["IoT", "AWS", "PostgreSQL", "TypeScript", "React"],
    teamMembers: [
      {
        slug: "javier-ortega",
        description: "Leads the telemetry ingestion pipeline and cloud architecture.",
        start_date: new Date("2025-06-01"),
        end_date: null,
      },
      {
        slug: "laura-martin",
        description: "Develops the dispatcher dashboard and reporting features.",
        start_date: new Date("2025-07-15"),
        end_date: null,
      },
    ],
  },
  {
    url_slug: "customer-support-assistant",
    name: "Customer Support Assistant",
    client: "helio-logistics",
    location: "REMOTE" as const,
    industry: "Logistics",
    type: "AI Assistant",
    start_date: new Date("2026-01-12"),
    end_date: new Date("2026-06-30"),
    summary: "An AI assistant that answers delivery questions and resolves common support requests.",
    description:
      "A LangChain-based assistant connected to Helio's order and tracking systems. It answers customers' delivery questions, reschedules deliveries and hands complex cases over to the support team.",
    capabilities: ["LangChain", "Python", "TypeScript", "Machine Learning"],
    teamMembers: [
      {
        slug: "laura-martin",
        description: "Built the assistant's agent, tools and integration with the tracking system.",
        start_date: new Date("2026-01-12"),
        end_date: new Date("2026-06-30"),
      },
    ],
  },
]

;(async () => {
  const pool = new Pool({
    host: DB_HOST,
    user: DB_USER,
    port: parseInt(DB_PORT || "5432"),
    password: DB_PASSWORD,
    database: DB_NAME,
    application_name: "lumi-seed",
    ssl: DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  })
  const db = drizzle(pool, { schema })

  console.log(`Seeding ${DB_NAME} on ${DB_HOST}`)

  await db.transaction(async (tx) => {
    // Capabilities have no unique constraint, so reuse an existing capability with the same English name. All their fields are content
    const capabilityIds: Record<string, string> = {}
    for (const capability of CAPABILITIES) {
      const [existing] = await tx
        .select({ id: schema.capabilities.id })
        .from(schema.capabilities)
        .where(eq(contentSql("capability", "name"), capability.name))
      const id = existing?.id ?? (await tx.insert(schema.capabilities).values({}).returning({ id: schema.capabilities.id }))[0].id
      await saveContent(tx, "capability", { capability_id: id }, DEFAULT_LANGUAGE, capability)
      capabilityIds[capability.name] = id
    }

    // Each record's shared fields go to the record and its content to its English translation

    const clientIds: Record<string, string> = {}
    for (const client of CLIENTS) {
      const { shared, content } = splitContent("client", client)
      const [row] = await tx
        .insert(schema.clients)
        .values(shared)
        .onConflictDoUpdate({ target: schema.clients.url_slug, set: shared })
        .returning({ id: schema.clients.id })
      await saveContent(tx, "client", { client_id: row.id }, DEFAULT_LANGUAGE, content)
      clientIds[client.url_slug] = row.id
    }

    const teamMemberIds: Record<string, string> = {}
    for (const { capabilities, ...teamMember } of TEAM_MEMBERS) {
      const { shared, content } = splitContent("teamMember", teamMember)
      const [row] = await tx
        .insert(schema.teamMembers)
        .values(shared)
        .onConflictDoUpdate({ target: schema.teamMembers.url_slug, set: shared })
        .returning({ id: schema.teamMembers.id })
      await saveContent(tx, "teamMember", { team_member_id: row.id }, DEFAULT_LANGUAGE, content)
      teamMemberIds[teamMember.url_slug] = row.id

      for (const [capabilityName, stars] of Object.entries(capabilities)) {
        await tx
          .insert(schema.teamMemberCapabilities)
          .values({ team_member_id: row.id, capability_id: capabilityIds[capabilityName], stars })
          .onConflictDoUpdate({ target: [schema.teamMemberCapabilities.team_member_id, schema.teamMemberCapabilities.capability_id], set: { stars } })
      }
    }

    for (const { client, capabilities, teamMembers, ...project } of PROJECTS) {
      const { shared, content } = splitContent("project", project)
      const values = { ...shared, client_id: clientIds[client] }
      const [row] = await tx
        .insert(schema.projects)
        .values(values)
        .onConflictDoUpdate({ target: schema.projects.url_slug, set: values })
        .returning({ id: schema.projects.id })
      await saveContent(tx, "project", { project_id: row.id }, DEFAULT_LANGUAGE, content)

      for (const capabilityName of capabilities) {
        await tx.insert(schema.projectCapabilities).values({ project_id: row.id, capability_id: capabilityIds[capabilityName] }).onConflictDoNothing()
      }

      for (const { slug, description, ...membership } of teamMembers) {
        const key = { project_id: row.id, team_member_id: teamMemberIds[slug] }
        await tx
          .insert(schema.projectTeamMembers)
          .values({ ...key, ...membership })
          .onConflictDoUpdate({ target: [schema.projectTeamMembers.team_member_id, schema.projectTeamMembers.project_id], set: membership })
        await saveContent(tx, "projectTeamMember", key, DEFAULT_LANGUAGE, { description })
      }
    }
  })

  console.log(
    `Seeded ${CAPABILITIES.length} capabilities, ${CLIENTS.length} clients, ${TEAM_MEMBERS.length} team members and ${PROJECTS.length} projects`
  )

  await pool.end()
})()
