import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import {
  Context,
  Controller,
  HTTPResult,
  Parameter,
  Post,
  ReadBody,
  type RequestContext,
} from "@antelopejs/interface-api";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import {
  MCP_CLIENT_HEADER,
  MCP_SESSION_HEADER,
  McpClientSchema,
} from "./bridge";
import { JsonValueSchema } from "./json";
import { answerMcpMessage, type McpSession } from "./protocol";

const CONTROLLER_LOCATION = "/dms";
const HANDLER_LOCATION = "mcp";

export const MCP_ROUTE_PATH = `${CONTROLLER_LOCATION}/${HANDLER_LOCATION}`;

const MAX_BODY_BYTES = 1024 * 1024;
const TOKEN_BYTES = 32;
const BEARER_PREFIX = "Bearer ";
const LOOPBACK_IPV6 = "::1";
/** The whole `127.0.0.0/8` range, plain or IPv4-mapped (Debian names the host `127.0.1.1`). */
const LOOPBACK_IPV4_PREFIXES = ["127.", "::ffff:127."];
const FORWARDING_HEADERS = [
  "x-forwarded-for",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "via",
  "true-client-ip",
  "cf-connecting-ip",
];

const HTTP_OK = 200;
const HTTP_ACCEPTED = 202;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const JSON_RPC_PARSE_ERROR = -32700;

interface ServedSession {
  session: McpSession;
  token: Buffer;
}

let served: ServedSession | undefined;

export function serveMcpSession(session: McpSession): string {
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  served = { session, token: Buffer.from(token) };
  return token;
}

function isDirectLocalCall(request: IncomingMessage): boolean {
  if (FORWARDING_HEADERS.some((name) => request.headers[name] !== undefined)) {
    return false;
  }
  const address = request.socket.remoteAddress ?? "";
  return (
    address === LOOPBACK_IPV6 ||
    LOOPBACK_IPV4_PREFIXES.some((prefix) => address.startsWith(prefix))
  );
}

function holdsToken(authorization: string | undefined, token: Buffer): boolean {
  if (authorization?.startsWith(BEARER_PREFIX) !== true) return false;
  const presented = Buffer.from(authorization.slice(BEARER_PREFIX.length));
  return presented.length === token.length && timingSafeEqual(presented, token);
}

function parseMessage(body: Buffer): JsonValue | undefined {
  try {
    return JsonValueSchema.parse(JSON.parse(body.toString("utf8")));
  } catch {
    return undefined;
  }
}

const PARSE_ERROR = {
  jsonrpc: "2.0",
  id: null,
  error: { code: JSON_RPC_PARSE_ERROR, message: "Parse error" },
};

export class McpController extends Controller(CONTROLLER_LOCATION) {
  @Post(HANDLER_LOCATION)
  async answer(
    @Context() ctx: RequestContext,
    @Parameter("authorization", "header") authorization: string | undefined,
    @Parameter(MCP_SESSION_HEADER, "header") sessionId: string | undefined,
    @Parameter(MCP_CLIENT_HEADER, "header") client: string | undefined,
  ): Promise<HTTPResult> {
    if (!isDirectLocalCall(ctx.rawRequest)) {
      return new HTTPResult(HTTP_FORBIDDEN, { error: "forbidden" });
    }
    const current = served;
    if (current === undefined || !holdsToken(authorization, current.token)) {
      return new HTTPResult(HTTP_UNAUTHORIZED, { error: "unauthorized" });
    }
    const message = parseMessage(await ReadBody(ctx, MAX_BODY_BYTES));
    if (message === undefined) {
      return new HTTPResult(HTTP_BAD_REQUEST, PARSE_ERROR);
    }
    const answer = await answerMcpMessage(
      current.session,
      message,
      sessionId,
      McpClientSchema.safeParse(client).data,
    );
    return answer === undefined
      ? new HTTPResult(HTTP_ACCEPTED)
      : new HTTPResult(HTTP_OK, answer);
  }
}
