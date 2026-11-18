import { ApolloLink, HttpLink } from "@apollo/client"
import { ApolloClient, InMemoryCache, registerApolloClient } from "@apollo/client-integration-nextjs"
import { loadDevMessages, loadErrorMessages } from "@apollo/client/dev"
import { CombinedGraphQLErrors, CombinedProtocolErrors } from "@apollo/client/errors"
import { ErrorLink } from "@apollo/client/link/error"

import { serverConfig } from "./serverConfig"

export const { getClient } = registerApolloClient(() => {
  const httpLink = new HttpLink({
    uri: `${serverConfig.apiEndpoint}/graphql`,
    headers: {
      authorization: serverConfig.apiKey,
    },
    // you can disable result caching here if you want to
    // (this does not work if you are rendering your page with `export const dynamic = "force-static"`)
    // fetchOptions: { cache: "no-store" },
  })

  const errorLink = new ErrorLink(({ error }) => {
    if (CombinedGraphQLErrors.is(error)) {
      error.errors.forEach(({ message, locations, path }) =>
        console.log(`[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`)
      )
    } else if (CombinedProtocolErrors.is(error)) {
      error.errors.forEach(({ message, extensions }) =>
        console.log(`[Protocol error]: Message: ${message}, Extensions: ${JSON.stringify(extensions)}`)
      )
    } else {
      console.error(`[Network error]: ${error}`)
    }
  })

  return new ApolloClient({
    cache: new InMemoryCache(),
    link: ApolloLink.from([errorLink, httpLink]),
  })
})

if (process.env.NODE_ENV === "development") {
  // Adds messages only in a dev environment
  loadDevMessages()
  loadErrorMessages()
}
