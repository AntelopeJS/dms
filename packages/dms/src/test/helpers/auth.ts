import type { AxiosInstance } from "axios";
import type { AuthController } from "../../routes";
import { seedUserInvite } from "./fixtures";
import { createClient } from "./http";

const DEFAULT_PASSWORD = "TestPassw0rd!";
const DEFAULT_NAME = "Test User";
const DEFAULT_LANG = "en";

/** Body of a successful token-issuing auth route, as the route returns it. */
export type AuthResponse = Awaited<ReturnType<AuthController["refresh"]>>;

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
  const response = await client.post<AuthResponse>("/api/auth/signup", {
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

  const userId = response.data.user?._id;
  if (!userId) throw new Error("Signup response carries no user id");
  return {
    email,
    password,
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
    userId,
  };
}

export async function loginUser(
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const client = createClient();
  const response = await client.post<AuthResponse>("/api/auth/login", {
    email,
    password,
  });

  if (response.status >= 400) {
    throw new Error(
      `Login failed [${response.status}]: ${JSON.stringify(response.data)}`,
    );
  }

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token,
  };
}

export function authorizedClient(token: string): AxiosInstance {
  const client = createClient();
  client.defaults.headers.common.Authorization = `Bearer ${token}`;
  return client;
}
