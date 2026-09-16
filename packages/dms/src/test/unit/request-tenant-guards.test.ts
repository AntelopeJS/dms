import { HTTPResult, type RequestContext } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { generateAccessToken } from "../../implementations/dms-auth";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import { authenticateTenantRequest } from "@antelopejs/interface-dms/guards";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import {
  RegisterTenantAccessGate,
  internal as tenantAccessInternal,
} from "@antelopejs/interface-dms/tenant-access";
import {
  authenticateRequestPrincipal,
  authenticateRequestUser,
  type RequestAuthenticator,
} from "@antelopejs/interface-dms/auth";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { denyingTenantGate } from "../helpers/page-access";

const TENANT = "request-guard-tenant";
const OTHER_TENANT = "request-guard-other";
const USER_ID = "request-guard-user";
const MEMBER_ID = "request-guard-member";
const AUTH_KEY = "request-guard-key";
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const gate = denyingTenantGate("request-guard-gate", TENANT);

function context(token: string): RequestContext {
  return {
    rawRequest: { headers: { authorization: `Bearer ${token}` } },
  } as RequestContext;
}

async function expectStatus(
  action: () => Promise<unknown>,
  status: number,
): Promise<void> {
  try {
    await action();
    expect.fail("Expected guard rejection");
  } catch (error) {
    expect(error).to.be.instanceOf(HTTPResult);
    expect((error as HTTPResult).getStatus()).to.equal(status);
  }
}

describe("[unit] request tenant guards — JWT and custom credentials", () => {
  let user: User;
  let jwt: string;
  const authenticator: RequestAuthenticator = {
    recognizes: (token) => token.startsWith("opaque."),
    authenticate: async () => ({ user, tenantId: TENANT }),
  };
  const options = { authenticators: [authenticator] };

  before(async () => {
    await GetModel(UserModel).insert({
      _id: USER_ID,
      email: "request-guard@test.local",
      name: "Request guard",
      authKey: AUTH_KEY,
      isValidated: true,
      language: "en",
      password: null,
    });
    const stored = await GetModel(UserModel).get(USER_ID);
    if (!stored) throw new Error("Missing guard test user");
    user = stored;
    jwt = generateAccessToken(TENANT, user).token;
    await GetModel(TenantMemberModel, TENANT).insert({
      _id: MEMBER_ID,
      userId: USER_ID,
      roleIds: [],
      isTenantOwner: false,
      joinedAt: new Date(),
      invitedBy: null,
    });
  });

  afterEach(() => {
    tenantAccessInternal.RegisterTenantAccessGate.unregister(gate);
  });

  it("preserves JWT authentication and binds its verified tenant", async () => {
    expect((await authenticateRequestUser(context(jwt)))._id).to.equal(USER_ID);
    const ctx = context(jwt);
    expect((await authenticateTenantRequest(ctx))._id).to.equal(USER_ID);
    expect(getRequestTenantId(ctx)).to.equal(TENANT);
    expect(
      (await authenticateTenantRequest(context(jwt), options))._id,
    ).to.equal(USER_ID);
  });

  it("rejects tampered JWT signatures and auth-key revocation", async () => {
    const parts = jwt.split(".");
    parts[2] = "invalid";
    await expectStatus(
      () => authenticateTenantRequest(context(parts.join("."))),
      HTTP_UNAUTHORIZED,
    );
    await GetModel(UserModel).update(USER_ID, { authKey: "rotated" });
    try {
      await expectStatus(
        () => authenticateTenantRequest(context(jwt)),
        HTTP_UNAUTHORIZED,
      );
    } finally {
      await GetModel(UserModel).update(USER_ID, { authKey: AUTH_KEY });
    }
  });

  it("does not enable opaque credentials on JWT-only routes", async () => {
    await expectStatus(
      () => authenticateTenantRequest(context("opaque.secret")),
      HTTP_UNAUTHORIZED,
    );
  });

  it("does not turn successful authentication into tenant membership", async () => {
    const foreign: RequestAuthenticator = {
      ...authenticator,
      authenticate: async () => ({ user, tenantId: OTHER_TENANT }),
    };
    expect(
      (await authenticateRequestPrincipal(context("opaque.secret"), [foreign]))
        .user._id,
    ).to.equal(USER_ID);
    await expectStatus(
      () =>
        authenticateTenantRequest(context("opaque.secret"), {
          authenticators: [foreign],
        }),
      HTTP_FORBIDDEN,
    );
  });

  it("requires current ownership for both credential paths", async () => {
    for (const token of [jwt, "opaque.secret"]) {
      await expectStatus(
        () =>
          authenticateTenantRequest(context(token), {
            ...options,
            requireOwner: true,
          }),
        HTTP_FORBIDDEN,
      );
    }
    await GetModel(TenantMemberModel, TENANT).update(MEMBER_ID, {
      isTenantOwner: true,
    });
    try {
      expect(
        (await authenticateTenantRequest(context(jwt), { requireOwner: true }))
          ._id,
      ).to.equal(USER_ID);
      expect(
        (
          await authenticateTenantRequest(context("opaque.secret"), {
            ...options,
            requireOwner: true,
          })
        )._id,
      ).to.equal(USER_ID);
    } finally {
      await GetModel(TenantMemberModel, TENANT).update(MEMBER_ID, {
        isTenantOwner: false,
      });
    }
  });

  it("rechecks tenant gates on long-lived requests; bypass does not bypass ownership", async () => {
    const ctx = context("opaque.secret");
    await authenticateTenantRequest(ctx, options);
    RegisterTenantAccessGate(gate);
    await expectStatus(
      () => authenticateTenantRequest(ctx, options),
      HTTP_FORBIDDEN,
    );
    await expectStatus(
      () => authenticateTenantRequest(context(jwt)),
      HTTP_FORBIDDEN,
    );
    expect(
      (
        await authenticateTenantRequest(ctx, {
          ...options,
          bypassTenantAccessGate: true,
        })
      )._id,
    ).to.equal(USER_ID);
    await expectStatus(
      () =>
        authenticateTenantRequest(ctx, {
          ...options,
          requireOwner: true,
          bypassTenantAccessGate: true,
        }),
      HTTP_FORBIDDEN,
    );
  });

  it("rechecks removed membership on long-lived requests", async () => {
    const ctx = context("opaque.secret");
    await authenticateTenantRequest(ctx, options);
    await GetModel(TenantMemberModel, TENANT).update(MEMBER_ID, {
      userId: "removed-user",
    });
    try {
      await expectStatus(
        () => authenticateTenantRequest(ctx, options),
        HTTP_FORBIDDEN,
      );
    } finally {
      await GetModel(TenantMemberModel, TENANT).update(MEMBER_ID, {
        userId: USER_ID,
      });
    }
  });
});
