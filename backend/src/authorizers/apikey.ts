import { createHash, timingSafeEqual } from "node:crypto"
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm"
import type { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent } from "aws-lambda"

// The installation's own API key (LUMI_API_KEY), which the web app's server, the backend services and the worker share. It
// alone opens the agents API's /admin routes and the worker. The GraphQL API also takes the keys admins generate, which
// roles.ts and the HTTP API's authorizer (httpApi.ts) resolve; this module needs no database, so the agents API's authorizer
// runs outside the VPC

let cachedApiKey: string | null = null

// REST API (agents API /admin): TOKEN authorizer that answers with an IAM policy. Only the internal key
export const restHandler = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
  if (!(await isApiKey(event.authorizationToken))) {
    // API Gateway answers 401 for this exact message
    throw new Error("Unauthorized")
  }

  // The result is cached per token, so the policy allows every method of the stage instead of only the requested one
  const [apiArn, stage] = event.methodArn.split("/")

  return {
    principalId: "api-key",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [{ Action: "execute-api:Invoke", Effect: "Allow", Resource: `${apiArn}/${stage}/*` }],
    },
  }
}

// Thrown by getApiKey when neither API_KEY nor SECRET_NAME is set: a request can't be the API key, which isApiKey answers as
// unauthorized rather than as a server error
export class ApiKeyNotConfiguredError extends Error {
  constructor() {
    super("No API key is configured: set API_KEY")
    this.name = "ApiKeyNotConfiguredError"
  }
}

// The API key: the API_KEY variable when set (local development and the containers), else the SSM parameter SECRET_NAME
// names, which the deployed Lambdas read
export const getApiKey = async (): Promise<string> => {
  const fromEnv = process.env.API_KEY
  if (fromEnv) {
    return fromEnv
  }

  if (cachedApiKey) {
    return cachedApiKey
  }

  if (!process.env.SECRET_NAME) {
    throw new ApiKeyNotConfiguredError()
  }

  const ssmClient = new SSMClient()

  const command = new GetParameterCommand({
    Name: process.env.SECRET_NAME,
    WithDecryption: true,
  })
  const data = await ssmClient.send(command)

  if (!data.Parameter || !data.Parameter.Value) {
    throw new Error("Parameter value is empty")
  }

  cachedApiKey = data.Parameter.Value
  return cachedApiKey
}

const digest = (value: string) => createHash("sha256").update(value).digest()

let notConfiguredReported = false

// Whether the token is the API key, compared in constant time: both are hashed first, so neither their content nor their
// length shows in the time the comparison takes. Without a configured key nothing is authorized (logged once); a key that
// can't be read from SSM still throws
export async function isApiKey(token: string | null | undefined): Promise<boolean> {
  if (!token) return false

  let apiKey: string
  try {
    apiKey = await getApiKey()
  } catch (error) {
    if (!(error instanceof ApiKeyNotConfiguredError)) throw error
    if (!notConfiguredReported) {
      notConfiguredReported = true
      console.error(`${error.message}: every request that needs the API key is refused`)
    }
    return false
  }
  return !!apiKey && timingSafeEqual(digest(token), digest(apiKey))
}
