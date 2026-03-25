import type { PluginDefinition } from "../types";

type HookCategory = "core" | "invitations" | "teams";

type OrganizationHookDefinition = {
  key: string;
  label: string;
  description: string;
  category: HookCategory;
  exampleTitle: string;
  exampleDescription: string;
  exampleCode: string;
};

function hookCode(name: string, body: string) {
  return `export const ${name} = {
  id: "${name}",
  label: "${name}",
  description: "Custom organization lifecycle hook",
  build: () => ({
    id: "${name}",
    organizationHook: async (data) => {
${body}
    },
  }),
};`;
}

const organizationHookDefinitions: OrganizationHookDefinition[] = [
  {
    key: "beforeCreateOrganization",
    label: "Before create organization",
    description: "Intercept organization creation before Better Auth writes the organization record.",
    category: "core",
    exampleTitle: "Normalize a new organization before insert",
    exampleDescription: "Return a partial `data` payload to rewrite the organization name or slug before it is stored.",
    exampleCode: hookCode(
      "customBeforeCreateOrganization",
      `      const name = String(data.organization.name ?? "").trim();
      return {
        data: {
          ...data.organization,
          name,
          slug: name.toLowerCase().replace(/\\s+/g, "-"),
        },
      };`,
    ),
  },
  {
    key: "afterCreateOrganization",
    label: "After create organization",
    description: "Run side effects after an organization and its initial membership have been created.",
    category: "core",
    exampleTitle: "Provision external workspace state",
    exampleDescription: "Use the created organization payload to seed downstream systems after successful creation.",
    exampleCode: hookCode(
      "customAfterCreateOrganization",
      `      await provisionWorkspaceForOrganization({
        organizationId: data.organization.id,
        ownerId: data.user.id,
      });`,
    ),
  },
  {
    key: "beforeUpdateOrganization",
    label: "Before update organization",
    description: "Validate or rewrite organization updates before they are saved.",
    category: "core",
    exampleTitle: "Block restricted slug changes",
    exampleDescription: "Throw or return rewritten data before Better Auth updates the organization record.",
    exampleCode: hookCode(
      "customBeforeUpdateOrganization",
      `      if (data.data.slug === "internal") {
        throw new Error("The internal slug is reserved.");
      }
      return { data: data.data };`,
    ),
  },
  {
    key: "afterUpdateOrganization",
    label: "After update organization",
    description: "React to organization changes after they are persisted.",
    category: "core",
    exampleTitle: "Sync organization metadata",
    exampleDescription: "Forward the updated organization payload to an external system after save.",
    exampleCode: hookCode(
      "customAfterUpdateOrganization",
      `      await syncOrganizationDirectory({
        organizationId: data.organization.id,
        updates: data.data,
      });`,
    ),
  },
  {
    key: "beforeDeleteOrganization",
    label: "Before delete organization",
    description: "Perform final checks or cleanup before an organization is deleted.",
    category: "core",
    exampleTitle: "Prevent deletion while invoices are open",
    exampleDescription: "Reject deletion when the organization still has open billing items.",
    exampleCode: hookCode(
      "customBeforeDeleteOrganization",
      `      const hasOpenInvoices = await billingHasOpenInvoices(data.organization.id);
      if (hasOpenInvoices) {
        throw new Error("Resolve open invoices before deleting the organization.");
      }`,
    ),
  },
  {
    key: "afterDeleteOrganization",
    label: "After delete organization",
    description: "Run cleanup after an organization has been deleted.",
    category: "core",
    exampleTitle: "Archive organization assets",
    exampleDescription: "Purge or archive non-authend resources after the delete completes.",
    exampleCode: hookCode(
      "customAfterDeleteOrganization",
      `      await archiveOrganizationAssets(data.organization.id);`,
    ),
  },
  {
    key: "beforeAddMember",
    label: "Before add member",
    description: "Validate or rewrite member attributes before a member is added to an organization.",
    category: "core",
    exampleTitle: "Force a default member role",
    exampleDescription: "Change the requested role before the membership record is created.",
    exampleCode: hookCode(
      "customBeforeAddMember",
      `      return {
        data: {
          ...data.member,
          role: "member",
        },
      };`,
    ),
  },
  {
    key: "afterAddMember",
    label: "After add member",
    description: "Trigger side effects after a user joins an organization.",
    category: "core",
    exampleTitle: "Push membership analytics",
    exampleDescription: "Send a membership-created event after Better Auth adds the member.",
    exampleCode: hookCode(
      "customAfterAddMember",
      `      await trackMembershipCreated({
        organizationId: data.organization.id,
        userId: data.user.id,
        role: data.member.role,
      });`,
    ),
  },
  {
    key: "beforeRemoveMember",
    label: "Before remove member",
    description: "Inspect a member removal before it happens.",
    category: "core",
    exampleTitle: "Protect billing contacts",
    exampleDescription: "Block removal when the target user still owns critical billing resources.",
    exampleCode: hookCode(
      "customBeforeRemoveMember",
      `      const ownsBillingAccount = await userOwnsBillingAccount(data.member.userId);
      if (ownsBillingAccount) {
        throw new Error("Transfer billing ownership before removing this member.");
      }`,
    ),
  },
  {
    key: "afterRemoveMember",
    label: "After remove member",
    description: "Perform cleanup after a member is removed.",
    category: "core",
    exampleTitle: "Revoke downstream access",
    exampleDescription: "Use the removed member payload to revoke related app permissions.",
    exampleCode: hookCode(
      "customAfterRemoveMember",
      `      await revokeWorkspaceAccess({
        organizationId: data.organization.id,
        userId: data.member.userId,
      });`,
    ),
  },
  {
    key: "beforeUpdateMemberRole",
    label: "Before update member role",
    description: "Gate or rewrite role changes before Better Auth applies them.",
    category: "core",
    exampleTitle: "Restrict owner demotion",
    exampleDescription: "Prevent role changes that would leave the organization without an owner.",
    exampleCode: hookCode(
      "customBeforeUpdateMemberRole",
      `      const removingLastOwner = await wouldRemoveLastOwner({
        organizationId: data.organization.id,
        memberId: data.member.id,
        nextRole: data.role,
      });
      if (removingLastOwner) {
        throw new Error("An organization must keep at least one owner.");
      }`,
    ),
  },
  {
    key: "afterUpdateMemberRole",
    label: "After update member role",
    description: "Run side effects after a member role change succeeds.",
    category: "core",
    exampleTitle: "Invalidate cached permissions",
    exampleDescription: "Purge cached policy decisions after a role change.",
    exampleCode: hookCode(
      "customAfterUpdateMemberRole",
      `      await clearPermissionCache({
        organizationId: data.organization.id,
        userId: data.member.userId,
      });`,
    ),
  },
  {
    key: "beforeCreateInvitation",
    label: "Before create invitation",
    description: "Validate invitations before they are written and sent.",
    category: "invitations",
    exampleTitle: "Limit invites to a verified domain",
    exampleDescription: "Reject invitations that target email domains outside your allowed list.",
    exampleCode: hookCode(
      "customBeforeCreateInvitation",
      `      const email = String(data.invitation.email ?? "");
      if (!email.endsWith("@example.com")) {
        throw new Error("Only example.com addresses can be invited.");
      }`,
    ),
  },
  {
    key: "afterCreateInvitation",
    label: "After create invitation",
    description: "Run side effects after an invitation record is created.",
    category: "invitations",
    exampleTitle: "Mirror invitations into CRM",
    exampleDescription: "Forward invitation state to external systems after insert.",
    exampleCode: hookCode(
      "customAfterCreateInvitation",
      `      await syncInvitationToCrm({
        invitationId: data.invitation.id,
        organizationId: data.organization.id,
      });`,
    ),
  },
  {
    key: "beforeAcceptInvitation",
    label: "Before accept invitation",
    description: "Inspect an invitation before a user accepts it.",
    category: "invitations",
    exampleTitle: "Require completed onboarding",
    exampleDescription: "Stop acceptance when the target user has not finished onboarding.",
    exampleCode: hookCode(
      "customBeforeAcceptInvitation",
      `      const onboardingComplete = await isOnboardingComplete(data.user.id);
      if (!onboardingComplete) {
        throw new Error("Finish onboarding before joining the organization.");
      }`,
    ),
  },
  {
    key: "afterAcceptInvitation",
    label: "After accept invitation",
    description: "Handle post-accept side effects like provisioning or notifications.",
    category: "invitations",
    exampleTitle: "Welcome the new member",
    exampleDescription: "Send a welcome or kick off app setup after an invitation is accepted.",
    exampleCode: hookCode(
      "customAfterAcceptInvitation",
      `      await sendWorkspaceWelcome({
        organizationId: data.organization.id,
        userId: data.user.id,
      });`,
    ),
  },
  {
    key: "beforeRejectInvitation",
    label: "Before reject invitation",
    description: "Inspect an invitation before it is rejected.",
    category: "invitations",
    exampleTitle: "Block rejection for enterprise SSO",
    exampleDescription: "Enforce a custom business rule before a rejection is allowed.",
    exampleCode: hookCode(
      "customBeforeRejectInvitation",
      `      if (data.organization.slug === "enterprise") {
        throw new Error("Enterprise invitations must be handled by support.");
      }`,
    ),
  },
  {
    key: "afterRejectInvitation",
    label: "After reject invitation",
    description: "React after an invitation is rejected.",
    category: "invitations",
    exampleTitle: "Notify the inviter",
    exampleDescription: "Send a follow-up notification to the original inviter after rejection.",
    exampleCode: hookCode(
      "customAfterRejectInvitation",
      `      await notifyInviterOfRejectedInvite({
        invitationId: data.invitation.id,
        organizationId: data.organization.id,
      });`,
    ),
  },
  {
    key: "beforeCancelInvitation",
    label: "Before cancel invitation",
    description: "Inspect an invitation before it is cancelled.",
    category: "invitations",
    exampleTitle: "Protect compliance invitations",
    exampleDescription: "Block cancelation for invitations that must stay open until a compliance check ends.",
    exampleCode: hookCode(
      "customBeforeCancelInvitation",
      `      const locked = await isInvitationLocked(data.invitation.id);
      if (locked) {
        throw new Error("This invitation is temporarily locked.");
      }`,
    ),
  },
  {
    key: "afterCancelInvitation",
    label: "After cancel invitation",
    description: "Perform cleanup after an invitation is cancelled.",
    category: "invitations",
    exampleTitle: "Remove queued reminders",
    exampleDescription: "Cancel reminder jobs or external workflows after invitation cancelation.",
    exampleCode: hookCode(
      "customAfterCancelInvitation",
      `      await cancelInvitationReminderJobs(data.invitation.id);`,
    ),
  },
  {
    key: "beforeCreateTeam",
    label: "Before create team",
    description: "Rewrite or validate team creation before the team is inserted.",
    category: "teams",
    exampleTitle: "Normalize default team names",
    exampleDescription: "Adjust team attributes before Better Auth creates the team.",
    exampleCode: hookCode(
      "customBeforeCreateTeam",
      `      return {
        data: {
          ...data.team,
          name: String(data.team.name ?? "").trim(),
        },
      };`,
    ),
  },
  {
    key: "afterCreateTeam",
    label: "After create team",
    description: "Run side effects after a team is created.",
    category: "teams",
    exampleTitle: "Seed default channels for a team",
    exampleDescription: "Provision team-level resources after the team exists.",
    exampleCode: hookCode(
      "customAfterCreateTeam",
      `      await createTeamChannels({
        organizationId: data.organization.id,
        teamId: data.team.id,
      });`,
    ),
  },
  {
    key: "beforeUpdateTeam",
    label: "Before update team",
    description: "Validate team updates before they are saved.",
    category: "teams",
    exampleTitle: "Prevent renaming a protected team",
    exampleDescription: "Reject updates to teams reserved by your app.",
    exampleCode: hookCode(
      "customBeforeUpdateTeam",
      `      if (data.team.name === "Support") {
        throw new Error("The Support team name is reserved.");
      }`,
    ),
  },
  {
    key: "afterUpdateTeam",
    label: "After update team",
    description: "Handle team updates after Better Auth persists them.",
    category: "teams",
    exampleTitle: "Resync team metadata",
    exampleDescription: "Push team changes to any mirrored service.",
    exampleCode: hookCode(
      "customAfterUpdateTeam",
      `      await syncTeamDirectory({
        teamId: data.team.id,
        organizationId: data.organization.id,
      });`,
    ),
  },
  {
    key: "beforeDeleteTeam",
    label: "Before delete team",
    description: "Perform checks before team deletion.",
    category: "teams",
    exampleTitle: "Protect the operations team",
    exampleDescription: "Block deletion of teams that your app considers essential.",
    exampleCode: hookCode(
      "customBeforeDeleteTeam",
      `      if (data.team.name === "Operations") {
        throw new Error("The Operations team cannot be deleted.");
      }`,
    ),
  },
  {
    key: "afterDeleteTeam",
    label: "After delete team",
    description: "Run cleanup after a team is deleted.",
    category: "teams",
    exampleTitle: "Archive team resources",
    exampleDescription: "Archive or purge team-scoped resources after deletion.",
    exampleCode: hookCode(
      "customAfterDeleteTeam",
      `      await archiveTeamResources({
        teamId: data.team.id,
        organizationId: data.organization.id,
      });`,
    ),
  },
  {
    key: "beforeAddTeamMember",
    label: "Before add team member",
    description: "Inspect team membership additions before they are applied.",
    category: "teams",
    exampleTitle: "Require a verified workspace email",
    exampleDescription: "Reject team membership when a user has not verified their workspace email.",
    exampleCode: hookCode(
      "customBeforeAddTeamMember",
      `      const verified = await hasVerifiedWorkspaceEmail(data.user.id);
      if (!verified) {
        throw new Error("Verify the workspace email before joining the team.");
      }`,
    ),
  },
  {
    key: "afterAddTeamMember",
    label: "After add team member",
    description: "Run team-scoped provisioning after a member is added.",
    category: "teams",
    exampleTitle: "Provision team resources",
    exampleDescription: "Create team-specific assets after membership is added.",
    exampleCode: hookCode(
      "customAfterAddTeamMember",
      `      await provisionTeamMembership({
        teamId: data.team.id,
        userId: data.user.id,
      });`,
    ),
  },
  {
    key: "beforeRemoveTeamMember",
    label: "Before remove team member",
    description: "Check a team membership removal before it happens.",
    category: "teams",
    exampleTitle: "Protect required responders",
    exampleDescription: "Block removals for users who still own active on-call schedules.",
    exampleCode: hookCode(
      "customBeforeRemoveTeamMember",
      `      const ownsSchedule = await ownsOnCallSchedule({
        teamId: data.team.id,
        userId: data.teamMember.userId,
      });
      if (ownsSchedule) {
        throw new Error("Transfer the on-call schedule before removing this team member.");
      }`,
    ),
  },
  {
    key: "afterRemoveTeamMember",
    label: "After remove team member",
    description: "Perform cleanup after removing a member from a team.",
    category: "teams",
    exampleTitle: "Revoke team entitlements",
    exampleDescription: "Remove team-scoped access after membership removal.",
    exampleCode: hookCode(
      "customAfterRemoveTeamMember",
      `      await revokeTeamEntitlements({
        teamId: data.team.id,
        userId: data.teamMember.userId,
      });`,
    ),
  },
];

export const ORGANIZATION_CORE_HOOK_KEYS = organizationHookDefinitions
  .filter((hook) => hook.category === "core")
  .map((hook) => hook.key);

export const ORGANIZATION_INVITATION_HOOK_KEYS = organizationHookDefinitions
  .filter((hook) => hook.category === "invitations")
  .map((hook) => hook.key);

export const ORGANIZATION_TEAM_HOOK_KEYS = organizationHookDefinitions
  .filter((hook) => hook.category === "teams")
  .map((hook) => hook.key);

export const ORGANIZATION_HOOK_KEYS = organizationHookDefinitions.map((hook) => hook.key);

function organizationHookSlot(hook: OrganizationHookDefinition) {
  return {
    key: `organizationHooks.${hook.key}`,
    label: hook.label,
    description: hook.description,
    kind: "hook" as const,
    required: false,
    handlerIds: ["authend.noopOrganizationHook"],
    inputSchema: {
      payload: "Better Auth organization hook payload",
      returns: "Optionally return { data: Partial<...> } for before* hooks",
    },
    exampleLanguage: "ts" as const,
    exampleTitle: hook.exampleTitle,
    exampleDescription: hook.exampleDescription,
    exampleCode: hook.exampleCode,
  };
}

export const organizationPluginDefinition: PluginDefinition = {
  id: "organization",
  version: "2.0.0",
  label: "Organization",
  description: "Organizations, members, invitations, teams, dynamic access control, and lifecycle hooks for multi-user backends.",
  category: "administration",
  documentationUrl: "https://better-auth.com/docs/plugins/organization",
  migrationStrategy: "sql",
  dependencies: [],
  requiredEnv: [],
  configSchema: [
    {
      key: "allowUserToCreateOrganization",
      label: "Allow user to create organization",
      type: "boolean",
      helpText: "Fallback boolean used when no custom creation policy handler is bound.",
      defaultValue: true,
    },
    {
      key: "organizationLimit",
      label: "Organization limit",
      type: "number",
      helpText: "Maximum number of organizations a user can create.",
    },
    {
      key: "creatorRole",
      label: "Creator role",
      type: "string",
      helpText: "Role assigned to the user who creates a new organization.",
      placeholder: "owner",
      defaultValue: "owner",
    },
    {
      key: "membershipLimit",
      label: "Membership limit",
      type: "number",
      helpText: "Maximum number of members allowed per organization.",
    },
    {
      key: "invitationExpiresIn",
      label: "Invitation expires in",
      type: "number",
      helpText: "Expiration time for invitations in seconds.",
    },
    {
      key: "invitationLimit",
      label: "Invitation limit",
      type: "number",
      helpText: "Maximum number of invitations a member can create.",
    },
    {
      key: "cancelPendingInvitationsOnReInvite",
      label: "Cancel pending invitations on re-invite",
      type: "boolean",
      helpText: "Cancel an existing pending invitation when the same email is invited again.",
      defaultValue: false,
    },
    {
      key: "requireEmailVerificationOnInvitation",
      label: "Require email verification on invitation",
      type: "boolean",
      helpText: "Require verified email before a user can accept or reject invitations.",
      defaultValue: false,
    },
    {
      key: "disableOrganizationDeletion",
      label: "Disable organization deletion",
      type: "boolean",
      helpText: "Prevent organization deletion through Better Auth endpoints.",
      defaultValue: false,
    },
    {
      key: "createDefaultTeam",
      label: "Create default team",
      type: "boolean",
      helpText: "Automatically create a default team when a new organization is created.",
      defaultValue: true,
    },
    {
      key: "maximumTeams",
      label: "Maximum teams",
      type: "number",
      helpText: "Maximum number of teams allowed in an organization.",
    },
    {
      key: "maximumMembersPerTeam",
      label: "Maximum members per team",
      type: "number",
      helpText: "Maximum number of users allowed in a team.",
    },
    {
      key: "allowRemovingAllTeams",
      label: "Allow removing all teams",
      type: "boolean",
      helpText: "Permit deleting the last remaining team in an organization.",
      defaultValue: false,
    },
    {
      key: "maximumRolesPerOrganization",
      label: "Maximum roles per organization",
      type: "number",
      helpText: "Maximum number of dynamic access-control roles a single organization can create.",
    },
  ],
  capabilities: [
    {
      key: "core",
      label: "Core organizations",
      description: "Organizations, memberships, core lifecycle hooks, and active organization state.",
      enabledByDefault: true,
      requires: [],
      addsModels: ["organization", "member", "invitation"],
      addsClientFeatures: ["organization", "organization.setActiveOrganization"],
      addsServerFeatures: ["organization CRUD", "member management", "organization lifecycle hooks"],
      addsAdminPanels: ["overview", "settings", "organizations", "members"],
    },
    {
      key: "invitations",
      label: "Invitations",
      description: "Invitation workflows, email delivery hooks, and invitation lifecycle hooks.",
      enabledByDefault: true,
      requires: ["core"],
      addsModels: [],
      addsClientFeatures: ["organization.invitations"],
      addsServerFeatures: ["invitation create/accept/reject/cancel", "invitation lifecycle hooks"],
      addsAdminPanels: ["invitations"],
    },
    {
      key: "teams",
      label: "Teams",
      description: "Team models, team membership flows, and team lifecycle hooks.",
      enabledByDefault: false,
      requires: ["core"],
      addsModels: ["team", "team_member"],
      addsClientFeatures: ["organization.teams", "organization.setActiveTeam"],
      addsServerFeatures: ["team CRUD", "team membership", "team lifecycle hooks"],
      addsAdminPanels: ["teams"],
    },
    {
      key: "dynamicAccessControl",
      label: "Dynamic access control",
      description: "Organization roles plus access control helpers and role-permission checks.",
      enabledByDefault: false,
      requires: ["core"],
      addsModels: ["organization_role"],
      addsClientFeatures: ["organization.checkRolePermission"],
      addsServerFeatures: ["organization roles", "permission evaluation"],
      addsAdminPanels: ["roles"],
    },
    {
      key: "activeOrganization",
      label: "Active organization session state",
      description: "Expose active organization session helpers in the client runtime.",
      enabledByDefault: true,
      requires: ["core"],
      addsModels: [],
      addsClientFeatures: ["organization.setActiveOrganization"],
      addsServerFeatures: ["active organization session state"],
      addsAdminPanels: [],
    },
    {
      key: "activeTeam",
      label: "Active team session state",
      description: "Expose active team session helpers when team support is enabled.",
      enabledByDefault: false,
      requires: ["core", "teams"],
      addsModels: [],
      addsClientFeatures: ["organization.setActiveTeam"],
      addsServerFeatures: ["active team session state"],
      addsAdminPanels: [],
    },
  ],
  extensionSlots: [
    {
      key: "allowUserToCreateOrganization",
      label: "Allow user to create organization",
      description: "Bind a code policy that decides whether a signed-in user can create a new organization.",
      kind: "policy",
      required: false,
      defaultHandlerId: "authend.allowAllOrganizations",
      handlerIds: ["authend.allowAllOrganizations", "authend.denyAllOrganizations"],
      inputSchema: {
        user: "Current Better Auth user record",
        returns: "boolean",
      },
      exampleLanguage: "ts",
      exampleTitle: "Limit creation to paid plans",
      exampleDescription: "Create a handler in `apps/api/src/core/plugins/extensions/organization.ts` and register it from `apps/api/src/core/plugins/extensions/index.ts`.",
      exampleCode: `export const proPlanOrganizationCreation = {
  id: "custom.proPlanOrganizationCreation",
  label: "Allow organization creation for paid plans",
  description: "Lets only paid-plan users create organizations.",
  build: () => ({
    id: "custom.proPlanOrganizationCreation",
    allowUserToCreateOrganization: async (user) => {
      const plan = await getUserPlan(String(user.id));
      return plan.name === "pro" || plan.name === "enterprise";
    },
  }),
};`,
    },
    {
      key: "sendInvitationEmail",
      label: "Send invitation email",
      description: "Bind a notification handler that sends invitation links for organization invites.",
      kind: "notification",
      required: false,
      defaultHandlerId: "authend.sendInvitationEmail",
      handlerIds: ["authend.sendInvitationEmail"],
      inputSchema: {
        invitation: "Invitation payload with id, email, role, inviter, and organization",
        request: "Optional incoming Request",
      },
      exampleLanguage: "ts",
      exampleTitle: "Send a branded invitation email",
      exampleDescription: "Wrap your email provider here instead of editing Better Auth internals.",
      exampleCode: `export const brandedInvitationEmail = {
  id: "custom.brandedInvitationEmail",
  label: "Send branded invitation email",
  description: "Uses the app email provider to send organization invitations.",
  build: () => ({
    id: "custom.brandedInvitationEmail",
    sendInvitationEmail: async ({ email, id, organization }) => {
      const url = \`\${process.env.APP_URL}/accept-invitation?id=\${encodeURIComponent(id)}\`;
      await sendAppEmail({
        to: email,
        subject: \`Join \${organization.name}\`,
        template: "organization-invite",
        data: { organizationName: organization.name, url },
      });
    },
  }),
};`,
    },
    {
      key: "ac",
      label: "Access control",
      description: "Bind a Better Auth access-control definition plus roles for dynamic access control.",
      kind: "access-control",
      required: true,
      defaultHandlerId: "authend.defaultOrgAccessControl",
      handlerIds: ["authend.defaultOrgAccessControl"],
      inputSchema: {
        ac: "Access control definition returned by createAccessControl",
        roles: "Named Better Auth roles",
      },
      exampleLanguage: "ts",
      exampleTitle: "Define custom organization permissions",
      exampleDescription: "Provide your own access-control tree and roles when dynamic access control is enabled.",
      exampleCode: `import { createAccessControl } from "better-auth/plugins";

const statements = {
  project: ["create", "read", "update", "delete"],
  billing: ["read", "update"],
};

const ac = createAccessControl(statements);

export const customOrganizationAccessControl = {
  id: "custom.organizationAccessControl",
  label: "Custom organization access control",
  description: "Defines project and billing permissions for organization roles.",
  build: () => ({
    id: "custom.organizationAccessControl",
    ac,
    roles: {
      owner: ac.newRole({ project: ["create", "read", "update", "delete"], billing: ["read", "update"] }),
      billing: ac.newRole({ project: ["read"], billing: ["read", "update"] }),
      member: ac.newRole({ project: ["read"], billing: [] }),
    },
  }),
};`,
    },
    ...organizationHookDefinitions.map(organizationHookSlot),
    {
      key: "teams.defaultTeam.customCreateDefaultTeam",
      label: "Custom create default team",
      description: "Override how Better Auth creates the initial team for a new organization.",
      kind: "hook",
      required: false,
      handlerIds: [],
      inputSchema: {
        organization: "Organization payload",
        ctx: "Better Auth endpoint context",
        returns: "Persisted team record",
      },
      exampleLanguage: "ts",
      exampleTitle: "Create a branded default team",
      exampleDescription: "Use your own adapter or service layer to create the first team with custom defaults.",
      exampleCode: `export const customCreateDefaultTeam = {
  id: "custom.createDefaultTeam",
  label: "Create branded default team",
  description: "Creates a default team with app-specific naming and metadata.",
  build: () => ({
    id: "custom.createDefaultTeam",
    customCreateDefaultTeam: async (organization, ctx) => {
      const adapter = getAppTeamAdapter(ctx);
      return adapter.createTeam({
        organizationId: String(organization.id),
        name: \`\${organization.name} Core\`,
      });
    },
  }),
};`,
    },
  ],
  models: [
    {
      key: "organization",
      tableName: "organization",
      label: "Organizations",
      capabilityKeys: ["core"],
      primaryKey: "id",
      fields: [
        { name: "id", type: "text", nullable: false, unique: true, indexed: true },
        { name: "name", type: "text", nullable: false, unique: false, indexed: false },
        { name: "slug", type: "text", nullable: false, unique: true, indexed: true },
        { name: "logo", type: "text", nullable: true, unique: false, indexed: false },
        { name: "metadata", type: "text", nullable: true, unique: false, indexed: false },
        { name: "created_at", type: "timestamp", nullable: false, unique: false, indexed: false },
      ],
      description: "Organization records managed by the Better Auth organization plugin.",
    },
    {
      key: "member",
      tableName: "member",
      label: "Members",
      capabilityKeys: ["core"],
      primaryKey: "id",
      fields: [
        { name: "id", type: "text", nullable: false, unique: true, indexed: true },
        { name: "user_id", type: "text", nullable: false, unique: false, indexed: true },
        { name: "organization_id", type: "text", nullable: false, unique: false, indexed: true },
        { name: "role", type: "text", nullable: false, unique: false, indexed: false },
        { name: "created_at", type: "timestamp", nullable: false, unique: false, indexed: false },
      ],
      description: "Organization membership records.",
    },
    {
      key: "invitation",
      tableName: "invitation",
      label: "Invitations",
      capabilityKeys: ["core"],
      primaryKey: "id",
      fields: [
        { name: "id", type: "text", nullable: false, unique: true, indexed: true },
        { name: "email", type: "text", nullable: false, unique: false, indexed: false },
        { name: "inviter_id", type: "text", nullable: false, unique: false, indexed: true },
        { name: "organization_id", type: "text", nullable: false, unique: false, indexed: true },
        { name: "role", type: "text", nullable: false, unique: false, indexed: false },
        { name: "status", type: "text", nullable: false, unique: false, indexed: false },
        { name: "team_id", type: "text", nullable: true, unique: false, indexed: true },
        { name: "expires_at", type: "timestamp", nullable: false, unique: false, indexed: false },
        { name: "created_at", type: "timestamp", nullable: false, unique: false, indexed: false },
      ],
      description: "Organization invitations and invitation lifecycle state.",
    },
    {
      key: "team",
      tableName: "team",
      label: "Teams",
      capabilityKeys: ["teams"],
      primaryKey: "id",
      fields: [
        { name: "id", type: "text", nullable: false, unique: true, indexed: true },
        { name: "organization_id", type: "text", nullable: false, unique: false, indexed: true },
        { name: "name", type: "text", nullable: false, unique: false, indexed: false },
        { name: "created_at", type: "timestamp", nullable: false, unique: false, indexed: false },
        { name: "updated_at", type: "timestamp", nullable: true, unique: false, indexed: false },
      ],
      description: "Team records within organizations.",
    },
    {
      key: "team_member",
      tableName: "team_member",
      label: "Team members",
      capabilityKeys: ["teams"],
      primaryKey: "id",
      fields: [
        { name: "id", type: "text", nullable: false, unique: true, indexed: true },
        { name: "team_id", type: "text", nullable: false, unique: false, indexed: true },
        { name: "user_id", type: "text", nullable: false, unique: false, indexed: true },
        { name: "created_at", type: "timestamp", nullable: false, unique: false, indexed: false },
      ],
      description: "Team membership join records.",
    },
    {
      key: "organization_role",
      tableName: "organization_role",
      label: "Organization roles",
      capabilityKeys: ["dynamicAccessControl"],
      primaryKey: "id",
      fields: [
        { name: "id", type: "text", nullable: false, unique: true, indexed: true },
        { name: "organization_id", type: "text", nullable: false, unique: false, indexed: true },
        { name: "role", type: "text", nullable: false, unique: false, indexed: true },
        { name: "permission", type: "text", nullable: false, unique: false, indexed: false },
        { name: "created_at", type: "timestamp", nullable: false, unique: false, indexed: false },
        { name: "updated_at", type: "timestamp", nullable: true, unique: false, indexed: false },
      ],
      description: "Dynamic access-control roles for organizations.",
    },
  ],
  adminPanels: [
    {
      key: "overview",
      label: "Overview",
      description: "Plugin health, docs, and capability status.",
      capabilityKeys: ["core"],
    },
    {
      key: "settings",
      label: "Settings",
      description: "Configuration, extension bindings, and diagnostics.",
      capabilityKeys: ["core"],
    },
    {
      key: "organizations",
      label: "Organizations",
      description: "Organization records and organization-level operations.",
      capabilityKeys: ["core"],
    },
    {
      key: "members",
      label: "Members",
      description: "Membership records and role management.",
      capabilityKeys: ["core"],
    },
    {
      key: "invitations",
      label: "Invitations",
      description: "Invitation workflows and delivery status.",
      capabilityKeys: ["invitations"],
    },
    {
      key: "teams",
      label: "Teams",
      description: "Team records, team membership, and default-team behavior.",
      capabilityKeys: ["teams"],
    },
    {
      key: "roles",
      label: "Roles & Permissions",
      description: "Dynamic access-control roles and permission surfaces.",
      capabilityKeys: ["dynamicAccessControl"],
    },
  ],
  examples: [
    {
      key: "client-create-organization",
      title: "Create an organization",
      description: "Use the native Better Auth client namespace after enabling the organization plugin.",
      language: "ts",
      audience: "client",
      capabilityKeys: ["core"],
      code: `await client.auth.organization.create({
  name: "Acme",
  slug: "acme",
});`,
    },
    {
      key: "client-invite-member",
      title: "Invite a member",
      description: "Create an invitation with the native organization client namespace.",
      language: "ts",
      audience: "client",
      capabilityKeys: ["core", "invitations"],
      code: `await client.auth.organization.inviteMember({
  organizationId: "org_123",
  email: "teammate@example.com",
  role: "member",
});`,
    },
    {
      key: "client-set-active-team",
      title: "Set the active team",
      description: "When team support is enabled, the client can switch the active team in session state.",
      language: "ts",
      audience: "client",
      capabilityKeys: ["teams", "activeTeam"],
      code: `await client.auth.organization.setActiveTeam({
  teamId: "team_123",
});`,
    },
    {
      key: "client-check-role-permission",
      title: "Check a role permission",
      description: "Use the Better Auth organization client helpers once dynamic access control is enabled.",
      language: "ts",
      audience: "client",
      capabilityKeys: ["dynamicAccessControl"],
      code: `const allowed = await client.auth.organization.checkRolePermission({
  role: "owner",
  permissions: { project: ["update"] },
});`,
    },
    {
      key: "server-bind-lifecycle-hook",
      title: "Register a lifecycle hook",
      description: "Add a handler in the extensions registry, then select it from the admin plugin sheet.",
      language: "ts",
      audience: "server",
      capabilityKeys: ["core"],
      code: `// apps/api/src/core/plugins/extensions/organization.ts
export const auditOrganizationChanges = {
  id: "custom.auditOrganizationChanges",
  label: "Audit organization changes",
  description: "Adds audit entries for organization lifecycle events.",
  build: () => ({
    id: "custom.auditOrganizationChanges",
    organizationHook: async (data) => {
      await recordAuditEvent("organization.lifecycle", data);
    },
  }),
};

// apps/api/src/core/plugins/extensions/index.ts
export const extensionHandlers = [
  ...organizationExtensionHandlers,
  auditOrganizationChanges,
];`,
    },
  ],
  clientNamespaces: ["organization"],
  serverOperations: ["auth.organization"],
  defaultConfig: {
    allowUserToCreateOrganization: true,
    creatorRole: "owner",
    cancelPendingInvitationsOnReInvite: false,
    requireEmailVerificationOnInvitation: false,
    disableOrganizationDeletion: false,
    createDefaultTeam: true,
    allowRemovingAllTeams: false,
  },
  defaultCapabilityState: {
    core: true,
    invitations: true,
    teams: false,
    dynamicAccessControl: false,
    activeOrganization: true,
    activeTeam: false,
  },
  defaultExtensionBindings: {
    allowUserToCreateOrganization: "authend.allowAllOrganizations",
    sendInvitationEmail: "authend.sendInvitationEmail",
    ac: "authend.defaultOrgAccessControl",
  },
};
