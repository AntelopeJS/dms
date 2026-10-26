import type { RequestContext } from "@antelopejs/interface-api";
import { expect } from "chai";
import {
  ResolveClientIp,
  getClientIp,
} from "@antelopejs/interface-dms/client-ip";
import { getAuthConfig } from "../../../../config";

const PROXY_ADDRESS = "::ffff:10.0.0.9";
const CLIENT_ADDRESS = "109.132.199.8";
const SPOOFED_ADDRESS = "1.2.3.4";

interface FakeRequest {
  socketAddress: string;
  forwardedFor?: string | string[];
}

function requestContext(request: FakeRequest): RequestContext {
  const headers =
    request.forwardedFor === undefined
      ? {}
      : { "x-forwarded-for": request.forwardedFor };
  const context = {
    rawRequest: {
      socket: { remoteAddress: request.socketAddress },
      headers,
    },
  } satisfies {
    rawRequest: Pick<RequestContext["rawRequest"], "headers"> & {
      socket: Pick<RequestContext["rawRequest"]["socket"], "remoteAddress">;
    };
  };
  // SAFETY: getClientIp reads only rawRequest.socket.remoteAddress and rawRequest.headers; this fixture never runs request handling or response methods.
  return context as RequestContext;
}

describe("[unit] client ip interface", () => {
  let configured: number | undefined;

  beforeEach(() => {
    configured = getAuthConfig().trustedProxies;
  });

  afterEach(() => {
    getAuthConfig().trustedProxies = configured;
  });

  it("answers the socket peer, unmapped, when no proxy is trusted", async () => {
    getAuthConfig().trustedProxies = 0;
    const context = requestContext({
      socketAddress: PROXY_ADDRESS,
      forwardedFor: SPOOFED_ADDRESS,
    });
    expect(await getClientIp(context)).to.equal("10.0.0.9");
  });

  it("follows auth.trustedProxies through x-forwarded-for", async () => {
    getAuthConfig().trustedProxies = 1;
    const context = requestContext({
      socketAddress: PROXY_ADDRESS,
      forwardedFor: `${SPOOFED_ADDRESS}, ${CLIENT_ADDRESS}`,
    });
    expect(await getClientIp(context)).to.equal(CLIENT_ADDRESS);
  });

  it("reads a header repeated across lines as one chain", async () => {
    getAuthConfig().trustedProxies = 1;
    const context = requestContext({
      socketAddress: PROXY_ADDRESS,
      forwardedFor: [SPOOFED_ADDRESS, CLIENT_ADDRESS],
    });
    expect(await getClientIp(context)).to.equal(CLIENT_ADDRESS);
  });

  it("resolves a source handed to ResolveClientIp directly", async () => {
    getAuthConfig().trustedProxies = 1;
    const resolved = await ResolveClientIp({
      socketAddress: PROXY_ADDRESS,
      forwardedFor: CLIENT_ADDRESS,
    });
    expect(resolved).to.equal(CLIENT_ADDRESS);
  });
});
