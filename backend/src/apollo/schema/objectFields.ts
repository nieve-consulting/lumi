import type { DocumentNode, FieldDefinitionNode } from "graphql"

// The fields of each object type the SDL defines or extends, by type name, read from its AST without building a schema
export function objectFields(typeDefs: DocumentNode): Map<string, Map<string, FieldDefinitionNode>> {
  const types = new Map<string, Map<string, FieldDefinitionNode>>()
  for (const definition of typeDefs.definitions) {
    if (definition.kind !== "ObjectTypeDefinition" && definition.kind !== "ObjectTypeExtension") continue
    const fields = types.get(definition.name.value) ?? new Map<string, FieldDefinitionNode>()
    for (const field of definition.fields ?? []) fields.set(field.name.value, field)
    types.set(definition.name.value, fields)
  }
  return types
}
