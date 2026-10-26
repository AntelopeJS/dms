import {
  ControllerMeta,
  HTTPResult,
  type RequestContext,
  computeParameter,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { decode, sign } from "jsonwebtoken";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import { authenticateTenantRequest } from "@antelopejs/interface-dms/guards";
import {
  getRequestTenantId,
  resolveRequestTenantId,
} from "@antelopejs/interface-dms/request-tenant";
import {
  RegisterTenantAccessGate,
  internal as tenantAccessInternal,
} from "@antelopejs/interface-dms/tenant-access";
import {
  AuthUser,
  authenticateRequestUser,
  generateAccessToken,
  IfAuthUser,
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
const TENANT_OWNER_REQUIRED = "error.tenant_owner_required";
const TENANT_MEMBER_REQUIRED = "error.tenant_member_required";

function context(token: string): RequestContext {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The guard context double provides authorization headers only, not the full HTTP request lifecycle.
  return {
    rawRequest: { headers: { authorization: `Bearer ${token}` } },
  } as RequestContext;
}

async function expectStatus<T>(
  action: () => Promise<T>,
  status: number,
): Promise<void> {
  try {
    await action();
    expect.fail("Expected guard rejection");
  } catch (error: PromiseRejectedResult["reason"]) {
    expect(error).to.be.instanceOf(HTTPResult);
    expect(error.getStatus()).to.equal(status);
  }
}

async function refusalOf<T>(
  action: () => Promise<T>,
): Promise<ReturnType<HTTPResult["getBody"]>> {
  try {
    await action();
  } catch (error: PromiseRejectedResult["reason"]) {
    expect(error).to.be.instanceOf(HTTPResult);
    expect(error.getStatus()).to.equal(HTTP_FORBIDDEN);
    return error.getBody();
  }
  return expect.fail("Expected guard rejection");
}

/** A token claiming `tenantId`, signed with a key the DMS never issued. */
function forgedToken(genuine: string, tenantId: string): string {
  const {
    iat: _iat,
    exp: _exp,
    ...claims
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The helper assumes its genuine locally generated JWT has object claims; decode itself does not verify that shape.
  } = decode(genuine) as Exclude<ReturnType<typeof decode>, string | null>;
  return sign({ ...claims, tenantId }, "not-the-user-secret");
}

/** Runs the provider an auth decorator installs on a controller property. */
async function provided(
  decorator: ReturnType<typeof AuthUser>,
  ctx: RequestContext,
): Promise<Awaited<ReturnType<typeof computeParameter>>> {
  class Probe {
    static location = "/probe";
  }
  decorator(Probe.prototype, "user");
  const meta = GetMetadata(Probe, ControllerMeta);
  return computeParameter(ctx, meta.computed_props.user, new Probe());
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
    jwt = (await generateAccessToken(TENANT, user)).token;
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

  it("never reads the tenant of a token whose signature fails", async () => {
    const forged = forgedToken(jwt, OTHER_TENANT);

    const plain = context(forged);
    expect(getRequestTenantId(plain)).to.equal(DEFAULT_TENANT_ID);
    expect(await resolveRequestTenantId(plain)).to.equal(DEFAULT_TENANT_ID);
    expect(getRequestTenantId(plain)).to.equal(DEFAULT_TENANT_ID);

    const anonymous = context(forged);
    expect(await provided(IfAuthUser(), anonymous)).to.equal(undefined);
    expect(getRequestTenantId(anonymous)).to.equal(DEFAULT_TENANT_ID);

    const guarded = context(forged);
    await expectStatus(() => provided(AuthUser(), guarded), HTTP_UNAUTHORIZED);
    expect(getRequestTenantId(guarded)).to.equal(DEFAULT_TENANT_ID);
  });

  it("binds the tenant of a verified token, through the decorators or on demand", async () => {
    const other = (await generateAccessToken(OTHER_TENANT, user)).token;

    const anonymous = context(other);
    expect(getRequestTenantId(anonymous)).to.equal(DEFAULT_TENANT_ID);
    expect(
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The decorator computation API erases its result type; this test assumes IfAuthUser supplies a user or undefined.
      ((await provided(IfAuthUser(), anonymous)) as User | undefined)?._id,
    ).to.equal(USER_ID);
    expect(getRequestTenantId(anonymous)).to.equal(OTHER_TENANT);

    const guarded = context(other);
    await provided(AuthUser(), guarded);
    expect(getRequestTenantId(guarded)).to.equal(OTHER_TENANT);

    const modelFirst = context(other);
    expect(await resolveRequestTenantId(modelFirst)).to.equal(OTHER_TENANT);
    expect(getRequestTenantId(modelFirst)).to.equal(OTHER_TENANT);

    const direct = context(other);
    await authenticateRequestUser(direct);
    expect(getRequestTenantId(direct)).to.equal(OTHER_TENANT);
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
    const authenticated = context(
      (await generateAccessToken(OTHER_TENANT, user)).token,
    );
    expect((await authenticateRequestUser(authenticated))._id).to.equal(
      USER_ID,
    );
    expect(getRequestTenantId(authenticated)).to.equal(OTHER_TENANT);
    await expectStatus(
      () => authenticateTenantRequest(authenticated),
      HTTP_FORBIDDEN,
    );
    const opaque = context("opaque.secret");
    await expectStatus(
      () =>
        authenticateTenantRequest(opaque, {
          authenticators: [foreign],
        }),
      HTTP_FORBIDDEN,
    );
    expect(getRequestTenantId(opaque)).to.equal(OTHER_TENANT);
    const foreignMembers = GetModel(TenantMemberModel, OTHER_TENANT);
    const foreignMemberId = `${MEMBER_ID}-foreign`;
    await foreignMembers.insert({
      _id: foreignMemberId,
      userId: USER_ID,
      roleIds: [],
      isTenantOwner: false,
      joinedAt: new Date(),
      invitedBy: null,
    });
    try {
      expect(
        (
          await authenticateTenantRequest(opaque, {
            authenticators: [foreign],
          })
        )._id,
      ).to.equal(USER_ID);
    } finally {
      await foreignMembers.delete(foreignMemberId);
    }
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

  it("refuses with an i18n key the dashboard translates", async () => {
    expect(
      await refusalOf(() =>
        authenticateTenantRequest(context(jwt), { requireOwner: true }),
      ),
    ).to.equal(TENANT_OWNER_REQUIRED);
    const foreign: RequestAuthenticator = {
      ...authenticator,
      authenticate: async () => ({ user, tenantId: OTHER_TENANT }),
    };
    expect(
      await refusalOf(() =>
        authenticateTenantRequest(context("opaque.secret"), {
          authenticators: [foreign],
        }),
      ),
    ).to.equal(TENANT_MEMBER_REQUIRED);
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
