import { gql } from "@apollo/client"

// Every handoff setting the admin form edits, with the delivery channels redacted, for the settings page and the save
export const HANDOFF_SETTINGS_FIELDS = gql`
  fragment HandoffSettingsFields on HandoffSettings {
    qualificationQuestions
    enquiryFields {
      field
      mode
    }
    booking {
      type
      url
      label
    }
    enquiryEnabled
    channels {
      key
      type
      recipients
      url
      hasSecret
    }
    availableChannelTypes
    updatedAt
  }
`
