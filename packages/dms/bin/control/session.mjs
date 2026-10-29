import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { saveRun } from "./run-state.mjs";

const REQUEST_TIMEOUT_MS = 30_000;
const UNAUTHORIZED = 401;
const PASSWORD_BYTES = 9;
const OK_MIN = 200;
const OK_MAX = 299;

/**
 * The credentials of the run's administrator, derived from the run id so a
 * journey can name them before onboarding.
 *
 * @param {{ id: string }} state The run
 * @returns {{ email: string, password: string, firstName: string, lastName: string }} The administrator's credentials
 */
export function adminCredentials(state) {
  return {
    email: `admin+${state.id}@verify.local`.toLowerCase(),
    password: state.adminPassword,
    firstName: "Verify",
    lastName: "Admin",
  };
}

/**
 * A password the DMS policy accepts: an uppercase letter, a digit and one of
 * `@$!%*?&`, at least eight characters.
 *
 * @returns {string} The password
 */
export function newPassword() {
  return `Vr1!${randomBytes(PASSWORD_BYTES).toString("base64url").replace(/[-_]/g, "x")}`;
}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * A new numbered evidence folder under `<run>/evidence/<group>/`.
 *
 * @param {{ evidence: string }} state The run
 * @param {string} group The command that writes it, such as `api`
 * @param {string} label What the step does
 * @returns {string} The folder
 */
export function nextFolder(state, group, label) {
  const parent = join(state.evidence, group);
  mkdirSync(parent, { recursive: true });
  const index = readdirSync(parent).length + 1;
  const folder = join(
    parent,
    `${String(index).padStart(2, "0")}-${slug(label)}`,
  );
  mkdirSync(folder, { recursive: true });
  return folder;
}

function parseBody(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Sends one request to the run's backend and writes request.json and
 * response.json into `folder`. Secrets in the request are left out.
 *
 * @param {string} folder Where the evidence goes
 * @param {{ url: string, method: string, body?: any, token?: string }} request What to send
 * @returns {Promise<{ status: number | null, body: any, error: string | null }>} The answer
 */
export async function recordedRequest(folder, request) {
  const headers = { accept: "application/json" };
  if (request.body !== undefined) headers["content-type"] = "application/json";
  if (request.token) headers.authorization = `Bearer ${request.token}`;
  writeFileSync(
    join(folder, "request.json"),
    `${JSON.stringify({ method: request.method, url: request.url, authenticated: Boolean(request.token), body: request.body ?? null }, null, 2)}\n`,
  );
  let answer;
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers,
      body:
        request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    answer = {
      status: response.status,
      body: parseBody(await response.text()),
      error: null,
    };
  } catch (error) {
    answer = { status: null, body: null, error: String(error?.cause ?? error) };
  }
  writeFileSync(
    join(folder, "response.json"),
    `${JSON.stringify(answer, null, 2)}\n`,
  );
  return answer;
}

/**
 * Whether an answer is a 2xx.
 *
 * @param {{ status: number | null }} answer The answer
 * @returns {boolean} True on 2xx
 */
export function isOk(answer) {
  return (
    answer.status !== null && answer.status >= OK_MIN && answer.status <= OK_MAX
  );
}

/**
 * Signs an account in through `POST /api/auth/login` and keeps its tokens in
 * the run state.
 *
 * @param {Record<string, any>} state The run
 * @param {string} account The account name, `admin` for the run's administrator
 * @returns {Promise<{ status: number | null, body: any }>} The login answer
 */
export async function signIn(state, account) {
  const credentials = state.accounts?.[account];
  if (!credentials) {
    throw new Error(
      `No account ${account} in the run; onboard first or add it with dms-control account.`,
    );
  }
  const folder = nextFolder(state, "auth", `login ${account}`);
  const answer = await recordedRequest(folder, {
    url: `${state.apiUrl}/api/auth/login`,
    method: "POST",
    body: { email: credentials.email, password: credentials.password },
  });
  if (isOk(answer) && answer.body?.access_token) {
    state.tokens = { ...state.tokens, [account]: answer.body.access_token };
    saveRun(state);
  }
  return answer;
}

/**
 * Creates the run's administrator through `POST /api/onboarding/register`,
 * then signs it in.
 *
 * @param {Record<string, any>} state The run
 * @param {{ platformName?: string }} options Wizard details
 * @returns {Promise<{ register: { status: number | null, body: any }, login: { status: number | null, body: any } | null }>} Both answers
 */
export async function onboard(state, options) {
  const admin = adminCredentials(state);
  const register = await recordedRequest(
    nextFolder(state, "onboard", "register"),
    {
      url: `${state.apiUrl}/api/onboarding/register`,
      method: "POST",
      body: {
        ...admin,
        platformName: options.platformName ?? `Verify ${state.id}`,
      },
    },
  );
  if (!isOk(register)) return { register, login: null };
  state.accounts = {
    ...state.accounts,
    admin: {
      email: admin.email,
      password: admin.password,
      userId: register.body?.[0] ?? null,
    },
  };
  saveRun(state);
  return { register, login: await signIn(state, "admin") };
}

/**
 * An authenticated (or anonymous) request to the run's backend, signing the
 * account in again once when its token was refused.
 *
 * @param {Record<string, any>} state The run
 * @param {{ method: string, path: string, body?: any, as: string, label?: string, folder?: () => string }} request What to send and as whom; `as` is an account name or `anon`; `folder` makes each attempt's evidence folder
 * @returns {Promise<{ status: number | null, body: any, error: string | null, folder: string }>} The answer and its evidence folder
 */
export async function apiRequest(state, request) {
  const label = request.label ?? `${request.method} ${request.path}`;
  const makeFolder = request.folder ?? (() => nextFolder(state, "api", label));
  const send = async () => {
    const folder = makeFolder();
    const token =
      request.as === "anon" ? undefined : state.tokens?.[request.as];
    return {
      ...(await recordedRequest(folder, {
        url: `${state.apiUrl}${request.path}`,
        method: request.method,
        body: request.body,
        token,
      })),
      folder,
    };
  };
  if (request.as !== "anon" && !state.tokens?.[request.as])
    await signIn(state, request.as);
  const first = await send();
  if (first.status !== UNAUTHORIZED || request.as === "anon") return first;
  await signIn(state, request.as);
  return send();
}
