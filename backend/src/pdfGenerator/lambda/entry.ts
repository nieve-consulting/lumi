import { accessFromAuthorizerEvent } from "@/authorizers/apiAccess"
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda"

import { parsePdfRequest, PdfPageRangeError, renderPdf } from "../render"

// The PDF service behind the HTTP API, whose authorizer (src/authorizers/httpApi.ts) lets in every role. Only the
// installation's own key's documents run scripts (RenderOptions in ../render.ts)

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const parsed = parsePdfRequest(event.requestContext.http.method, event.body)
  if (!parsed.ok) {
    return {
      statusCode: parsed.statusCode,
      body: JSON.stringify({ message: parsed.message }),
    }
  }

  try {
    // @sparticuz/chromium is ESM-only and this Lambda is bundled as CommonJS, so it can't be require()d
    const { default: chromium } = await import("@sparticuz/chromium")
    const pdf = await renderPdf(
      parsed.request,
      { executablePath: await chromium.executablePath(), args: chromium.args, headless: "shell" },
      { scripts: accessFromAuthorizerEvent(event).role === "internal" }
    )

    return {
      statusCode: 200,
      body: Buffer.from(pdf).toString("base64"),
      isBase64Encoded: true,
      headers: {
        "Content-disposition": `attachment; filename=${parsed.request.filename}`,
        "Content-Type": "application/pdf",
      },
    }
  } catch (error) {
    if (error instanceof PdfPageRangeError) {
      return { statusCode: 400, body: JSON.stringify({ message: error.message }) }
    }
    console.error(error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal Server Error" }),
    }
  }
}
