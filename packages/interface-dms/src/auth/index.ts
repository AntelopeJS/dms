import { HTTPResult, type RequestContext } from "@antelopejs/interface-api";
import { CreateAuthDecorator } from "@antelopejs/interface-auth";
import { InterfaceFunction } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { ExecuteHooks, Hook } from "../hooks";
import { DEFAULT_TENANT_ID } from "../constants";
import {
  buildExternalIdentityId,
  type SessionModel,
  type User,
  type UserExternalIdentity,
  UserExternalIdentityModel,
  type UserModel,
} from "./db";
import {
  type RequestAuthenticator,
  type RequestPrincipal,
  resolveRequestPrincipal,
} from "./request-authenticators";

export * from "./request-authenticators";

export type DeviceType = "mobile" | "tablet" | "desktop";

export interface ParsedUserAgent {
  browserName: string;
  browserVersion: string;
  osName: string;
  osVersion: string;
  deviceType: DeviceType;
}

/**
 * Sending account e-mails and reading a user agent are DMS behaviour, not
 * contract: the templates, the mailer and the parser are the module's. Declared
 * here because the registration and session flows below need them.
 */
export const NotifyWelcome =
  InterfaceFunction<(userId: string, name: string) => void>();

export const NotifyCollaboratorJoined =
  InterfaceFunction<
    (ownerIds: string[], name: string, email: string) => void
  >();

export const ParseUserAgent =
  InterfaceFunction<(userAgent: string) => ParsedUserAgent>();

const HTTP_UNAUTHORIZED = 401;
const HTTP_CONFLICT = 409;
const UNAUTHORIZED_MESSAGE = "Unauthorized";
const IDENTITY_ALREADY_LINKED_MESSAGE = "error.oauth.identity_already_linked";

/**
 * Authenticate with route-local credential handlers, otherwise the existing JWT interfaces.
 * Recognized failures and ambiguous handlers never fall back to JWT. Every call revalidates;
 * repeat calls must retain the same credential, user and tenant. No permissions are granted.
 */
export async function authenticateRequestPrincipal(
  ctx: RequestContext,
  authenticators: readonly RequestAuthenticator[] = [],
): Promise<RequestPrincipal> {
  return resolveRequestPrincipal(ctx, authenticators, async (token) => {
    const decoded = await internal.AuthUserAuthenticator(token);
    const user = await internal.AuthUserValidator(decoded);
    if (!user || typeof user === "boolean") {
      throw new HTTPResult(HTTP_UNAUTHORIZED, UNAUTHORIZED_MESSAGE);
    }
    return { user, tenantId: decoded.tenantId || DEFAULT_TENANT_ID };
  });
}

export interface TenantTokenInput {
  tenantId: string;
  id: string;
  rawToken: string;
}

/**
 * Authenticate the request's bearer token and return the validated `User`.
 * Throws 401 when the token is missing or invalid. Building block for
 * authorization guards layered on top of this interface (see
 * `interfaces/dms/guards`).
 */
export async function authenticateRequestUser(
  ctx: RequestContext,
): Promise<User> {
  const authHeader = ctx.rawRequest?.headers?.authorization;
  const token =
    typeof authHeader === "string" ? authHeader.split(" ")[1] : undefined;
  const decoded = await internal.AuthUserAuthenticator(token);
  const validated = await internal.AuthUserValidator(decoded);
  if (!validated || typeof validated === "boolean") {
    throw new HTTPResult(HTTP_UNAUTHORIZED, UNAUTHORIZED_MESSAGE);
  }
  return validated;
}

/**
 * @internal
 */
export namespace internal {
  export const AuthUserAuthenticator =
    InterfaceFunction<(data: string | undefined) => TenantTokenInput>();

  export const IfAuthUserAuthenticator =
    InterfaceFunction<
      (data: string | undefined) => TenantTokenInput | undefined
    >();

  export const AuthRawUserValidator =
    InterfaceFunction<(data: TenantTokenInput) => boolean | User>();

  export const AuthUserValidator =
    InterfaceFunction<(data: TenantTokenInput) => boolean | User>();

  export const IfAuthUserValidator =
    InterfaceFunction<
      (data: TenantTokenInput | undefined) => User | undefined
    >();

  export const AuthOwnerOnlyValidator =
    InterfaceFunction<(data: TenantTokenInput) => boolean | User>();
}

/**
 * Authentication decorator that returns raw user data, ignoring email validation.
 */
export const AuthRawUser = CreateAuthDecorator({
  source: (req, _) => req.headers.authorization?.split(" ")[1],
  authenticator: internal.AuthUserAuthenticator,
  validator: internal.AuthRawUserValidator,
});

/**
 * Authentication decorator that provides the `User` instance and enforces email validation
 * if required by the configuration.
 */
export const AuthUser = CreateAuthDecorator({
  source: (req, _) => req.headers.authorization?.split(" ")[1],
  authenticator: internal.AuthUserAuthenticator,
  validator: internal.AuthUserValidator,
});

/**
 * Optional authentication decorator that returns User | undefined without throwing 401
 * Use this for routes that work both when authenticated and unauthenticated
 */
export const IfAuthUser = CreateAuthDecorator({
  source: (req, _) => req.headers.authorization?.split(" ")[1],
  authenticator: internal.IfAuthUserAuthenticator,
  validator: internal.IfAuthUserValidator,
});

/**
 * Authentication decorator that requires the authenticated user to be a platform
 * owner (`User.owner === true`). Throws 401 when no token is provided and 403
 * when the user is authenticated but not an owner.
 *
 * Used to gate all module routes (`/module/<id>/...`) per the SaaS security
 * convention: modules are owner-only administration spaces.
 *
 * @returns Authentication decorator
 */
export const AuthOwnerOnly = () => {
  const decorator = CreateAuthDecorator({
    source: (req, _) => req.headers.authorization?.split(" ")[1],
    authenticator: internal.AuthUserAuthenticator,
    validator: (data) => internal.AuthOwnerOnlyValidator(data),
  });
  return decorator();
};

/**
 * Generate an access token for a user
 * @param tenantId
 * @param user
 * @param sessionId
 * @returns A valid access token for a duration defined in the configuration (`accessTokenLifetime`)
 */
export const generateAccessToken =
  InterfaceFunction<
    (
      tenantId: string,
      user: User,
      sessionId?: string,
    ) => { expiresIn: number; token: string }
  >();

/**
 * Generate a refresh token for a user
 * @param tenantId
 * @param user
 * @param sessionId
 * @returns A valid refresh token for a duration defined in the configuration (`refreshTokenLifetime`)
 */
export const generateRefreshToken =
  InterfaceFunction<
    (
      tenantId: string,
      user: User,
      sessionId?: string,
    ) => { expiresIn: number; token: string }
  >();

/**
 * Validate a refresh token and return the user id and tenantId
 * @param token
 * @returns The user id and tenantId
 */
export const validateRefreshToken =
  InterfaceFunction<
    (token: string) => { id: string; tenantId: string; sessionId?: string }
  >();

export const generateTwoFactorToken =
  InterfaceFunction<
    (tenantId: string, user: User) => { token: string; expiresIn: number }
  >();

export const validateTwoFactorToken = InterfaceFunction<
  (token: string) => {
    id: string;
    tenantId: string;
    purpose?: string;
    user: User;
  }
>();

export const generateTenantAssignmentToken =
  InterfaceFunction<(user: User) => { token: string; expiresIn: number }>();

export const validateTenantAssignmentToken =
  InterfaceFunction<(token: string) => { id: string; user: User }>();

export const send2FAEmail =
  InterfaceFunction<(user: User, code: string) => Promise<void>>();

export const sendEmailValidationEmail =
  InterfaceFunction<(user: User) => Promise<void>>();
export const sendEmailForgotEmail =
  InterfaceFunction<(user: User) => Promise<void>>();
/**
 * What an invitation email can say about where it leads. Every field is
 * optional: without them the email keeps its generic wording.
 */
export interface AdminInviteEmailContext {
  /** The workspace the invitee is joining. */
  workspaceName?: string;
  /** Who sent the invitation. */
  inviterName?: string;
  /** The invitee's language (`en`, `fr`, ...); English when unsupported. */
  language?: string;
}

export const sendAdminInviteEmail =
  InterfaceFunction<
    (
      email: string,
      token: string,
      inviteeName?: string,
      context?: AdminInviteEmailContext,
    ) => Promise<void>
  >();

/**
 * Remove sensitive keys from a user
 * @param user
 * @returns Partial user without sensitive keys
 */
export const sanitizeUser = InterfaceFunction<(user: User) => Partial<User>>();

export interface JwtUserPayload {
  id: string;
  tenantId: string;
  sessionId?: string;
}

export interface ExternalIdentityInput {
  provider: string;
  providerAccountId: string;
  email: string;
}

export interface ExternalIdentityLinkResult {
  wasCreated: boolean;
}

function assertIdentityOwnedBy(
  identity: UserExternalIdentity,
  userId: string,
): void {
  if (identity.userId !== userId) {
    throw new HTTPResult(HTTP_CONFLICT, IDENTITY_ALREADY_LINKED_MESSAGE);
  }
}

/**
 * Bind an external login identity (GitHub, Google, ...) to a user.
 *
 * Idempotent for the owning user: re-linking the same provider account only
 * refreshes its last login. Binding an account already owned by another user
 * throws 409 — a provider account is a single-user credential. Uniqueness is
 * enforced by the row's deterministic primary key, so two concurrent bindings
 * of the same provider account collide instead of duplicating; the loser
 * re-reads and either refreshes or gets the 409.
 *
 * Scoped to authentication. Provider connections powering product features
 * (repository access, deployments) keep their own storage and must never be
 * derived from these rows.
 *
 * @param userId Owning user
 * @param identity Provider account to bind
 * @returns Whether the binding was created by this call, as opposed to an
 *          existing one being refreshed
 */
export async function linkExternalIdentity(
  userId: string,
  identity: ExternalIdentityInput,
): Promise<ExternalIdentityLinkResult> {
  const model = GetModel(UserExternalIdentityModel);
  const id = buildExternalIdentityId(
    identity.provider,
    identity.providerAccountId,
  );
  const email = identity.email.toLowerCase();
  const now = new Date();

  const existing = await model.get(id);
  if (existing) {
    assertIdentityOwnedBy(existing, userId);
    await model.update(id, { email, lastLoginAt: now });
    return { wasCreated: false };
  }

  try {
    await model.insert({
      _id: id,
      userId,
      provider: identity.provider,
      providerAccountId: identity.providerAccountId,
      email,
      createdAt: now,
      lastLoginAt: now,
    });
    return { wasCreated: true };
  } catch (insertError) {
    const raced = await model.get(id);
    if (!raced) throw insertError;
    assertIdentityOwnedBy(raced, userId);
    await model.update(id, { email, lastLoginAt: now });
    return { wasCreated: false };
  }
}

/**
 * List the external login identities bound to a user.
 *
 * @param userId Owning user
 * @returns Bound identities, empty when the user only signs in with a password
 */
export function getExternalIdentities(
  userId: string,
): Promise<UserExternalIdentity[]> {
  return GetModel(UserExternalIdentityModel).getByUserId(userId);
}

async function notifyAccountCreation(
  userModel: UserModel,
  user: User,
): Promise<void> {
  void NotifyWelcome(user._id, user.name);

  try {
    const owners = await userModel.getOwners();
    const ownerIds = owners
      .map((owner) => owner._id)
      .filter((id) => id !== user._id);

    if (ownerIds.length > 0) {
      void NotifyCollaboratorJoined(ownerIds, user.name, user.email);
    }
  } catch (error) {
    Logging.Error(
      `[DMS] Failed to notify owners of new collaborator "${user._id}": ${String(error)}`,
    );
  }
}

/**
 * Run everything that must happen once an account has really joined a tenant:
 * the welcome and collaborator notifications, then the `USER_REGISTERED` hook.
 *
 * Shared by every entry point that registers a user — the DMS password signup,
 * a provider login consuming an invitation, and any module owning its own
 * registration flow (a SaaS transactional signup calls it once provisioning
 * committed) — so automations and notifications never depend on which door the
 * account came through.
 *
 * The hook is observational: registration is already complete when it runs, so
 * a failing subscriber is logged rather than allowed to fail the request and
 * strand the user without a valid retry token.
 *
 * @param userModel Users model
 * @param user The registered account
 * @param tenantId Tenant the account joined
 */
export async function announceRegistration(
  userModel: UserModel,
  user: User,
  tenantId: string,
): Promise<void> {
  void notifyAccountCreation(userModel, user);

  try {
    await ExecuteHooks(Hook.USER_REGISTERED, {
      tenantId,
      userId: user._id,
      email: user.email,
      name: user.name,
    });
  } catch (error) {
    Logging.Error("[DMS] USER_REGISTERED hook failed:", error);
  }
}

export async function createSession(
  sessionModel: SessionModel,
  userId: string,
  userAgent: string,
  ip: string,
): Promise<string> {
  const parsed = await ParseUserAgent(userAgent);
  const browser = [parsed.browserName, parsed.browserVersion]
    .filter(Boolean)
    .join(" ");
  const os = [parsed.osName, parsed.osVersion].filter(Boolean).join(" ");
  const deviceType = parsed.deviceType;

  const now = new Date();
  const ids = await sessionModel.insert({
    userId,
    refreshToken: "",
    userAgent: userAgent || "",
    ip: ip || "",
    browser: browser || "Unknown",
    os: os || "Unknown",
    deviceType,
    location: "",
    createdAt: now,
    lastActiveAt: now,
  });

  return ids[0];
}
