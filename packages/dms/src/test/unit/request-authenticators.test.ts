import type { RequestContext } from "@antelopejs/interface-api";
import { HTTPResult } from "@antelopejs/interface-api";
import { expect } from "chai";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  type RequestAuthenticator,
  type RequestPrincipal,
  resolveRequestPrincipal,
} from "@antelopejs/interface-dms/auth/request-authenticators";

const UNAUTHORIZED = 401;
const TENANT = "credential-tenant";
const USER_ID = "credential-user";

function context(authorization = "Bearer opaque.secret"): RequestContext {
  return { rawRequest: { headers: { authorization } } } as RequestContext;
}

function principal(tenantId = TENANT, userId = USER_ID): RequestPrincipal {
  return { tenantId, user: { _id: userId } as User };
}

function handler(authenticate = async () => principal()): RequestAuthenticator {
  return { recognizes: (token) => token.startsWith("opaque."), authenticate };
}

async function expectUnauthorized(
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    await action();
    expect.fail("Expected authentication failure");
  } catch (error) {
    expect(error).to.be.instanceOf(HTTPResult);
    expect((error as HTTPResult).getStatus()).to.equal(UNAUTHORIZED);
  }
}

describe("[unit] request authenticators", () => {
  let jwtCalls = 0;
  const jwt = async () => {
    jwtCalls++;
    return principal("jwt-tenant");
  };
  beforeEach(() => {
    jwtCalls = 0;
  });

  it("binds tenant to the verified credential across context wrappers", async () => {
    const ctx = context();
    const result = await resolveRequestPrincipal(ctx, [handler()], jwt);
    result.tenantId = "tampered";
    expect(getRequestTenantId({ ...ctx })).to.equal(TENANT);
    expect(jwtCalls).to.equal(0);
  });

  it("uses JWT only when no handler recognizes the credential", async () => {
    const ctx = context("Bearer jwt");
    await resolveRequestPrincipal(ctx, [handler()], jwt);
    expect(getRequestTenantId(ctx)).to.equal("jwt-tenant");
    expect(jwtCalls).to.equal(1);
  });

  it("serializes concurrent validations without caching their result", async () => {
    const ctx = context();
    let attempts = 0;
    const candidate = handler(async () => {
      attempts++;
      return principal();
    });
    await Promise.all([
      resolveRequestPrincipal(ctx, [candidate], jwt),
      resolveRequestPrincipal(ctx, [candidate], jwt),
    ]);
    expect(attempts).to.equal(2);
    expect(getRequestTenantId(ctx)).to.equal(TENANT);
  });

  it("propagates a concurrent recognized failure without JWT downgrade", async () => {
    const ctx = context();
    const candidate = handler(async () => {
      throw new HTTPResult(UNAUTHORIZED);
    });
    await Promise.all([
      expectUnauthorized(() => resolveRequestPrincipal(ctx, [candidate], jwt)),
      expectUnauthorized(() => resolveRequestPrincipal(ctx, [], jwt)),
    ]);
    expect(jwtCalls).to.equal(0);
    expect(() => getRequestTenantId(ctx)).to.throw();
  });

  it("never falls back after recognized malformed, revoked or failed credentials", async () => {
    const ctx = context("Bearer opaque.malformed");
    const rejected = handler(async () => {
      throw new HTTPResult(UNAUTHORIZED);
    });
    await expectUnauthorized(() =>
      resolveRequestPrincipal(ctx, [rejected], jwt),
    );
    expect(() => getRequestTenantId(ctx)).to.throw();
    await expectUnauthorized(() => resolveRequestPrincipal(ctx, [], jwt));
    expect(jwtCalls).to.equal(0);
  });

  it("rejects ambiguous handlers without attempting either authentication", async () => {
    let attempts = 0;
    const candidate = handler(async () => {
      attempts++;
      return principal();
    });
    await expectUnauthorized(() =>
      resolveRequestPrincipal(context(), [candidate, candidate], jwt),
    );
    expect(attempts).to.equal(0);
    expect(jwtCalls).to.equal(0);
  });

  for (const authorization of [
    "",
    "Basic opaque.secret",
    "Bearer opaque.secret extra",
  ]) {
    it(`rejects malformed authorization: ${authorization}`, async () => {
      await expectUnauthorized(() =>
        resolveRequestPrincipal(context(authorization), [handler()], jwt),
      );
      expect(jwtCalls).to.equal(0);
    });
  }

  it("rejects a missing authenticated tenant rather than selecting the default tenant", async () => {
    const ctx = context();
    await expectUnauthorized(() =>
      resolveRequestPrincipal(ctx, [handler(async () => principal(""))], jwt),
    );
    expect(() => getRequestTenantId(ctx)).to.throw();
  });

  it("revalidates long-lived requests and makes revocation terminal", async () => {
    const ctx = context();
    let revoked = false;
    let attempts = 0;
    const candidate = handler(async () => {
      attempts++;
      if (revoked) throw new HTTPResult(UNAUTHORIZED);
      return principal();
    });
    await resolveRequestPrincipal(ctx, [candidate], jwt);
    await resolveRequestPrincipal(ctx, [candidate], jwt);
    revoked = true;
    await expectUnauthorized(() =>
      resolveRequestPrincipal(ctx, [candidate], jwt),
    );
    expect(attempts).to.equal(3);
    expect(() => getRequestTenantId(ctx)).to.throw();
    expect(jwtCalls).to.equal(0);
  });

  for (const changed of [
    principal("other-tenant"),
    principal(TENANT, "other-user"),
  ]) {
    it(`rejects principal reassignment to ${changed.tenantId}/${changed.user._id}`, async () => {
      const ctx = context();
      await resolveRequestPrincipal(ctx, [handler()], jwt);
      await expectUnauthorized(() =>
        resolveRequestPrincipal(ctx, [handler(async () => changed)], jwt),
      );
      expect(() => getRequestTenantId(ctx)).to.throw();
    });
  }

  it("does not reuse another request's identity or a changed header", async () => {
    const ctx = context();
    await resolveRequestPrincipal(ctx, [handler()], jwt);
    const unrelated = context("Bearer jwt");
    await resolveRequestPrincipal(unrelated, [], jwt);
    expect(getRequestTenantId(unrelated)).to.equal("jwt-tenant");
    ctx.rawRequest.headers.authorization = "Bearer jwt";
    expect(() => getRequestTenantId(ctx)).to.throw();
    await expectUnauthorized(() => resolveRequestPrincipal(ctx, [], jwt));
    expect(jwtCalls).to.equal(1);
  });
});
