import type { CodegenConfig } from "@graphql-codegen/cli"

const config: CodegenConfig = {
  overwrite: true,
  // The SDL module rather than a running server, so codegen needs no `.env`, database or port. tsx loads the TypeScript
  // and resolves its `@/` imports through this workspace's tsconfig.json; the `codegen` script runs the CommonJS build of
  // the CLI because that is the one whose loader goes through `require`.
  require: ["tsx/cjs"],
  schema: "src/apollo/schema/type-defs.ts",
  generates: {
    "src/generated/graphql.ts": {
      config: {
        contextType: "@/apollo/types#Context",
        // Client, TeamMember and Project carry the language the query requested, which their nested fields are read in
        mappers: {
          Client: "@/apollo/schema/clients/mappers#ClientMapper",
          TeamMember: "@/apollo/schema/teamMembers/mappers#TeamMemberMapper",
          Project: "@/apollo/schema/projects/mappers#ProjectMapper",
          Thread: "@/apollo/schema/threads/mappers#ThreadMapper",
        },
        scalars: {
          DateTime: "string",
          Date: "string",
        },
      },
      plugins: ["typescript", "typescript-resolvers"],
    },
  },
}

export default config
