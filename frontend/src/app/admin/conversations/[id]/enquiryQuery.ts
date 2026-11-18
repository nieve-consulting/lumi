import { gql } from "@apollo/client"

// What the conversation page shows of an enquiry: the visitor's details and each channel's delivery
export const ENQUIRY_FRAGMENT = gql`
  fragment EnquiryFields on Enquiry {
    id
    submissionId
    createdAt
    status
    contact {
      field
      value
    }
    qualification {
      question
      answer
    }
    message
    topic
    deliveries {
      channelKey
      channelType
      status
      attempts
      lastError
      deliveredAt
      updatedAt
      destination
    }
  }
`
