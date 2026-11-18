import type { Writable } from "node:stream"

// Event the shim emits on the response stream with the status code and headers, the local server turns it into res.writeHead
export const METADATA_EVENT = "awslambda:metadata"

export interface ResponseMetadata {
  statusCode?: number
  headers?: Record<string, string>
}

// Stand-in for the globalThis.awslambda object that the Lambda Node.js runtime provides
export function installAwsLambdaShim() {
  const shim = {
    streamifyResponse: <T>(handler: T) => handler,
    HttpResponseStream: {
      from(writable: Writable, metadata: ResponseMetadata) {
        writable.emit(METADATA_EVENT, metadata)
        return writable
      },
    },
  }

  ;(globalThis as unknown as { awslambda: typeof shim }).awslambda = shim
}
