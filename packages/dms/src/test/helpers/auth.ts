import type { AxiosInstance } from "axios";
import { z } from "zod";
import type { AuthController } from "../../routes";
import { seedUserInvite } from "./fixtures";
import { createClient } from "./http";
import { type BodyResponse, parseBody } from "./parse-body";

const DEFAULT_PASSWORD = "TestPassw0rd!";
const DEFAULT_NAME = "Test User";
const DEFAULT_LANG = "en";

/** Body of a token-issuing auth route, as the route returns it. */
export type AuthResponse = Awaited<ReturnType<AuthController["signup"]>>;

type LoginResponse = Awaited<ReturnType<AuthController["login"]>>;

const UserBody = z.object({ _id: z.string(), email: z.string() }).partial();

const AuthBody = z.object({
  token_type: z.string(),
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string(),
  user: UserBody.optional(),
}) satisfies z.ZodType<AuthResponse>;

const TwoFactorRequiredBody = z.object({
  requires_2fa: z.literal(true),
  two_factor_token: z.string(),
  methods: z.array(z.string()),
});

const TenantAssignmentRequiredBody = z.object({
  requires_tenant_assignment: z.literal(true),
  tenant_assignment_token: z.string(),
  user: UserBody,
});

const LoginBody = z.union([
  AuthBody,
  TwoFactorRequiredBody,
  TenantAssignmentRequiredBody,
]) satisfies z.ZodType<LoginResponse>;

/** Parses the body of a route that answers with a session (signup, session handoff). */
export function parseAuthBody(response: BodyResponse): AuthResponse {
  return parseBody(AuthBody, response);
}

export interface RegisteredUser {
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
  userId: string;
}

export interface SignupOptions {
  email?: string;
  password?: string;
  name?: string;
  lang?: string;
  owner?: boolean;
  roles_ids?: string[];
}

function randomEmail(): string {
  return `test-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@test.local`;
}

export async function registerUser(
  options: SignupOptions = {},
): Promise<RegisteredUser> {
  const email = options.email ?? randomEmail();
  const password = options.password ?? DEFAULT_PASSWORD;

  const invite = await seedUserInvite({
    email,
    owner: options.owner,
    roles_ids: options.roles_ids,
  });

  const client = createClient();
  const response = await client.post("/api/auth/signup", {
    name: options.name ?? DEFAULT_NAME,
    email,
    password,
    lang: options.lang ?? DEFAULT_LANG,
    token: invite.token,
  });

  if (response.status >= 400) {
    throw new Error(
      `Signup failed [${response.status}]: ${JSON.stringify(response.data)}`,
    );
  }

  const body = parseAuthBody(response);
  const userId = body.user?._id;
  if (!userId) throw new Error("Signup response carries no user id");
  return {
    email,
    password,
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    userId,
  };
}

export async function loginUser(
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const client = createClient();
  const response = await client.post("/api/auth/login", { email, password });

  if (response.status >= 400) {
    throw new Error(
      `Login failed [${response.status}]: ${JSON.stringify(response.data)}`,
    );
  }

  const body = parseBody(LoginBody, response);
  if (!("access_token" in body)) {
    throw new Error(
      `Login did not open a session (two-factor or tenant assignment required): ${JSON.stringify(response.data)}`,
    );
  }
  return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

export function authorizedClient(token: string): AxiosInstance {
  const client = createClient();
  client.defaults.headers.common.Authorization = `Bearer ${token}`;
  return client;
}
