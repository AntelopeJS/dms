import { z } from "zod";

/**
 * The user a backend answer carries (`GET /api/auth/me`, or the `user` of a
 * token pair): the user row as `sanitizeUser` leaves it. The session keeps it
 * whole, so its other fields pass through; the frontend server reads its
 * `language`.
 */
export const sessionUser = z
  .object({ language: z.string().optional() })
  .passthrough();

/**
 * A token pair: what `POST /api/auth/refresh` and
 * `POST /api/auth/switch-tenant` answer. Its other fields (`token_type`,
 * `expires_in`) are not read, and are stripped.
 */
export const tokenPair = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
});

const sessionTokens = tokenPair.extend({ user: sessionUser.optional() });

/** A token pair and the user a sign-in answer adds to it. */
export type SessionTokens = z.infer<typeof sessionTokens>;

const twoFactorChallenge = z
  .object({
    requires_2fa: z.literal(true),
    two_factor_token: z.string(),
    methods: z.array(z.string()),
  })
  .passthrough();

const tenantAssignment = z
  .object({
    requires_tenant_assignment: z.literal(true),
    tenant_assignment_token: z.string(),
  })
  .passthrough();

/**
 * What a sign-in answer asks next: a second factor, a workspace to join, or
 * nothing, the session being open. A step keeps the whole answer, which the
 * browser reads.
 */
export type LoginOutcome =
  | { kind: "2fa"; answer: z.infer<typeof twoFactorChallenge> }
  | { kind: "tenant-assignment"; answer: z.infer<typeof tenantAssignment> }
  | { kind: "session"; tokens: SessionTokens };

/**
 * The answer of a backend route that signs in (`/api/auth/login`,
 * `/api/auth/signup`, `/api/auth/verify-2fa`, a declared establish endpoint,
 * `/api/auth/oauth/:provider/callback`), the backend's `LoginOutcome`.
 */
export const loginOutcome = z.union([
  twoFactorChallenge.transform(
    (answer): LoginOutcome => ({ kind: "2fa", answer }),
  ),
  tenantAssignment.transform(
    (answer): LoginOutcome => ({ kind: "tenant-assignment", answer }),
  ),
  sessionTokens.transform(
    (tokens): LoginOutcome => ({ kind: "session", tokens }),
  ),
]);

/**
 * `GET /api/auth/oauth/:provider/authorize-url`: the provider's sign-in page,
 * and the state its callback must bring back.
 */
export const oauthAuthorization = z.object({
  state: z.string(),
  authorizeUrl: z.string(),
});
