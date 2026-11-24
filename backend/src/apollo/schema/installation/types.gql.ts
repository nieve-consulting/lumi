export const installationTypeDefs = /* GraphQL */ `
  type Query {
    "The Lumi version this installation runs and the latest published release, so admins learn when an upgrade is available"
    lumiVersion: LumiVersion!
  }

  type LumiVersion {
    "The version the backend image was built from, such as 0.62.0. local or unknown for a build without a release version"
    current: String!
    "Whether the latest release could be checked: OFF when LUMI_UPDATE_CHECK turns the check off, UNAVAILABLE when GitHub couldn't be reached"
    check: UpdateCheck!
    "The latest published release. Null unless check is OK"
    latest: LumiRelease
    "Whether latest is a newer release than current. False when the check isn't OK or current isn't a release version"
    updateAvailable: Boolean!
  }

  enum UpdateCheck {
    OK
    OFF
    UNAVAILABLE
  }

  type LumiRelease {
    "The release's version, such as 0.63.0"
    version: String!
    "The release's page on GitHub, with its notes"
    url: String!
    "When the release was published, as an ISO 8601 timestamp"
    publishedAt: String!
  }
`
