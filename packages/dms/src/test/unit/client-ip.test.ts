import { expect } from "chai";
import type { AuthConfig } from "../../config";
import {
  resolveClientIp,
  trustedProxyCount,
} from "../../routes/auth/client-ip";

const SOCKET_ADDRESS = "10.0.0.9";
const CLIENT_ADDRESS = "109.132.199.8";
const FRONTEND_EGRESS = "195.201.71.66";
const CDN_EDGE = "104.23.166.64";
const STAGING_CHAIN = `${CLIENT_ADDRESS},${FRONTEND_EGRESS},${CDN_EDGE}`;

function authConfig(overrides: Partial<AuthConfig>): AuthConfig {
  return {
    jwtSecret: "",
    emailValidationTokenLifetime: 0,
    passwordRecoverTokenLifetime: 0,
    accessTokenLifetime: 0,
    refreshTokenLifetime: 0,
    userSensitiveKeys: [],
    mustValidateEmail: false,
    ...overrides,
  };
}

describe("[unit] resolveClientIp", () => {
  it("records the socket peer and ignores the header without trusted proxies", () => {
    expect(
      resolveClientIp(
        { socketAddress: SOCKET_ADDRESS, forwardedFor: STAGING_CHAIN },
        0,
      ),
    ).to.equal(SOCKET_ADDRESS);
  });

  it("walks back one entry per trusted proxy from the right", () => {
    const source = {
      socketAddress: SOCKET_ADDRESS,
      forwardedFor: STAGING_CHAIN,
    };
    expect(resolveClientIp(source, 1)).to.equal(CDN_EDGE);
    expect(resolveClientIp(source, 2)).to.equal(FRONTEND_EGRESS);
    expect(resolveClientIp(source, 3)).to.equal(CLIENT_ADDRESS);
  });

  it("never reaches the entries a client wrote ahead of the trusted ones", () => {
    expect(
      resolveClientIp(
        {
          socketAddress: SOCKET_ADDRESS,
          forwardedFor: `6.6.6.6, 7.7.7.7, ${CLIENT_ADDRESS}`,
        },
        1,
      ),
    ).to.equal(CLIENT_ADDRESS);
  });

  it("yields the leftmost entry of a chain shorter than configured", () => {
    expect(
      resolveClientIp(
        { socketAddress: SOCKET_ADDRESS, forwardedFor: CLIENT_ADDRESS },
        3,
      ),
    ).to.equal(CLIENT_ADDRESS);
  });

  it("falls back to the socket peer without a header", () => {
    expect(
      resolveClientIp(
        { socketAddress: SOCKET_ADDRESS, forwardedFor: undefined },
        2,
      ),
    ).to.equal(SOCKET_ADDRESS);
    expect(
      resolveClientIp(
        { socketAddress: SOCKET_ADDRESS, forwardedFor: " , " },
        2,
      ),
    ).to.equal(SOCKET_ADDRESS);
  });

  it("returns an empty string when nothing is known", () => {
    expect(
      resolveClientIp({ socketAddress: undefined, forwardedFor: undefined }, 1),
    ).to.equal("");
  });

  it("keeps IPv6 addresses whole and trims the separators", () => {
    expect(
      resolveClientIp(
        { socketAddress: "::1", forwardedFor: " 2001:db8::1 , fd00::2 " },
        2,
      ),
    ).to.equal("2001:db8::1");
  });

  it("unmaps IPv4-mapped IPv6 addresses", () => {
    expect(
      resolveClientIp(
        { socketAddress: "::ffff:127.0.0.1", forwardedFor: undefined },
        0,
      ),
    ).to.equal("127.0.0.1");
    expect(
      resolveClientIp({ socketAddress: "::ffff:abcd", forwardedFor: "" }, 0),
    ).to.equal("::ffff:abcd");
  });
});

describe("[unit] trustedProxyCount", () => {
  it("trusts no proxy by default", () => {
    expect(trustedProxyCount(authConfig({}))).to.equal(0);
  });

  it("reads trustedProxies", () => {
    expect(trustedProxyCount(authConfig({ trustedProxies: 3 }))).to.equal(3);
  });

  it("maps the deprecated oauth.trustProxy to one hop", () => {
    expect(
      trustedProxyCount(authConfig({ oauth: { trustProxy: true } })),
    ).to.equal(1);
  });

  it("prefers trustedProxies over oauth.trustProxy", () => {
    expect(
      trustedProxyCount(
        authConfig({ trustedProxies: 0, oauth: { trustProxy: true } }),
      ),
    ).to.equal(0);
  });

  it("ignores a value that is not a non-negative integer", () => {
    expect(trustedProxyCount(authConfig({ trustedProxies: -1 }))).to.equal(0);
    expect(trustedProxyCount(authConfig({ trustedProxies: 1.5 }))).to.equal(0);
  });
});
