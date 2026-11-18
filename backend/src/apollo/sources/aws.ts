import { sendEmail } from "@/utils/email"
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda"

// One client per process, so a warm Lambda reuses its kept-alive connection and resolved credentials
let lambdaClient: LambdaClient | undefined

export default class AwsDataSource {
  getLambdaClient() {
    lambdaClient ??= new LambdaClient({ region: process.env.AWS_REGION })
    return lambdaClient
  }

  // Through the backend's email transport (src/utils/email.ts): from EMAIL_FROM, through SMTP_URL when set, else SES. Without
  // EMAIL_FROM the installation has no sender, so nothing is sent from an address it doesn't own
  async sendEmail(recipient: string[], subject: string, body: string) {
    try {
      await sendEmail({ to: recipient, subject, html: body })
    } catch (error) {
      throw new Error(`Error sending email: ${error}`, { cause: error })
    }
  }

  async invokeLambda(functionName: string, payload?: Record<string, unknown>) {
    if (!functionName) {
      throw new Error("Function name is required")
    }

    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: "Event",
      Payload: payload ? JSON.stringify(payload) : undefined,
    })

    try {
      await this.getLambdaClient().send(command)
      return true
    } catch (error) {
      console.error("Error invoking Lambda:", error)
      throw new Error(`Error invoking Lambda: ${error}`, { cause: error })
    }
  }
}
