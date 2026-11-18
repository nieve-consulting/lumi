import "server-only"

import { CombinedGraphQLErrors } from "@apollo/client/errors"

// Media storage (uploaded images) is optional in a self-hosted installation. Without it, the API answers its upload and
// download queries with an error saying so, which these tell apart from other failures

const NOT_CONFIGURED_CODE = "MEDIA_STORAGE_NOT_CONFIGURED"

export function isMediaStorageNotConfigured(error: unknown) {
  return (
    CombinedGraphQLErrors.is(error) &&
    error.errors.some(({ message, extensions }) => extensions?.code === NOT_CONFIGURED_CODE || /media storage/i.test(message))
  )
}
