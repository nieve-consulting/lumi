export const adminAccountsTypeDefs = /* GraphQL */ `
  "An email and password admin account, on an installation whose web app signs admins in itself (ADMIN_AUTH_PROVIDER=local)"
  type AdminAccount {
    id: ID!
    "Trimmed and lowercase"
    email: String!
    name: String
    "Set for a temporary password: the admin must choose a new one before using the admin"
    mustChangePassword: Boolean!
    createdAt: String!
    lastSignInAt: String
    "When the password was last set (changed, reset or created). Sessions signed in before it no longer grant access"
    passwordChangedAt: String!
  }

  "The installation's first admin, created by the onboarding wizard. An invalid one fails with BAD_USER_INPUT and extensions.problems for firstAdmin.email, firstAdmin.name or firstAdmin.password"
  input FirstAdminInput {
    email: String!
    name: String
    "At least 12 characters, at most 256"
    password: String!
  }

  "An admin added by another. An invalid one fails with BAD_USER_INPUT and extensions.problems for email or name"
  input NewAdminAccountInput {
    email: String!
    name: String
  }

  type CreatedAdminAccount {
    account: AdminAccount!
    "Shown once, never stored in plain text"
    temporaryPassword: String!
  }

  type Query {
    "Whether any admin account exists (setup wizard decides whether to ask for the first admin)"
    hasAdminAccounts: Boolean!
    "Every admin account, the oldest first. Admins only"
    adminAccounts: [AdminAccount!]!
    "The account behind a session, or null when it was removed (checked on privileged requests)"
    adminAccount(id: ID!): AdminAccount
  }

  type Mutation {
    "Null for a wrong email/password or unknown email (same timing: hash a dummy password). Fails with RATE_LIMITED (extensions.retryAfterSeconds) when the email or IP is throttled: 10 failures per 15 minutes each. Records lastSignInAt on success"
    verifyAdminCredentials(email: String!, password: String!, clientIp: String): AdminAccount
    "Adds an admin with a generated temporary password. Fails with BAD_USER_INPUT or ADMIN_EXISTS (email taken). Admins only"
    createAdminAccount(input: NewAdminAccountInput!): CreatedAdminAccount!
    "Fails with NOT_FOUND or LAST_ADMIN (atomic: never leaves zero accounts). Admins only"
    deleteAdminAccount(id: ID!): Boolean!
    "Checks the current password, sets the new one and clears mustChangePassword. Fails with INVALID_CREDENTIALS, BAD_USER_INPUT (policy, or same as current; extensions.problems for newPassword), RATE_LIMITED (failures count like sign-ins) or NOT_FOUND (account removed)"
    changeAdminPassword(id: ID!, currentPassword: String!, newPassword: String!): AdminAccount!
  }
`
