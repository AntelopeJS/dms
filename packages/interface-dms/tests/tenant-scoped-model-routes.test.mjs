import assert from "node:assert/strict";
import test from "node:test";
import {
  Controller,
  Get,
  HTTPResult,
  SetParameterProvider,
} from "@antelopejs/interface-api";
import { ImplementInterface } from "@antelopejs/interface-core";
import {
  GetModel,
  RegisterSchema,
} from "@antelopejs/interface-database-decorators";
import * as auth from "../dist/auth/index.js";
import { authenticateRequestPrincipal } from "../dist/auth/internal/request-principal.js";
import { DEFAULT_TENANT_ID, TENANT_SCHEMA_NAME } from "../dist/constants.js";
import { RoleModel } from "../dist/db/index.js";
import { TenantScopedModel } from "../dist/tenant-scoped-model.js";
import { serveRoute } from "./helpers/serve-route.mjs";

const TENANT_A = "workspace-a";
const TENANT_B = "workspace-b";
const TENANTS = [TENANT_A, TENANT_B, DEFAULT_TENANT_ID];
const OK = 200;
const UNAUTHORIZED = 401;

/** One I/O turn, as a database read takes. */
const io = () => new Promise((resolve) => setImmediate(resolve));

/** @param {string} tenantId */
const jwt = (tenantId) => `jwt.member.${tenantId}`;

/** @param {string} tenantId */
const opaque = (tenantId) => `opaque.member.${tenantId}`;

/** @param {string} token */
const bearer = (token) => `Bearer ${token}`;

/** @param {string | undefined} token */
async function decodeJwt(token) {
  await io();
  const [kind, id, tenantId] = token?.split(".") ?? [];
  if (kind !== "jwt") return undefined;
  return { id, tenantId, rawToken: token };
}

/** @param {{ id: string }} data */
async function validateUser(data) {
  await io();
  return { _id: data.id };
}

ImplementInterface(
  { internal: auth.internal },
  {
    internal: {
      AuthUserAuthenticator: async (/** @type {string} */ token) => {
        const data = await decodeJwt(token);
        if (!data) throw new HTTPResult(UNAUTHORIZED, "Unauthorized");
        return data;
      },
      IfAuthUserAuthenticator: decodeJwt,
      AuthUserValidator: validateUser,
      AuthRawUserValidator: validateUser,
      IfAuthUserValidator: validateUser,
      AuthOwnerOnlyValidator: validateUser,
    },
  },
);

await RegisterSchema(TENANT_SCHEMA_NAME);

const opaqueCredential = {
  recognizes: (/** @type {string} */ token) => token.startsWith("opaque."),
  authenticate: async (/** @type {string} */ token) => {
    await io();
    const [, id, tenantId] = token.split(".");
    return { user: { _id: id }, tenantId };
  },
};

/**
 * A guard that authenticates the request's credential, the step every tenant
 * guard (`AuthTenantMember`, `AuthTenantOwner`) starts with, and provides the
 * tenant it verified.
 *
 * @param {object[]} [authenticators]
 */
const CredentialGuard =
  (authenticators) =>
  (
    /** @type {object} */ target,
    /** @type {PropertyKey} */ key,
    /** @type {number | undefined} */ index,
  ) =>
    SetParameterProvider(target, key, index, (ctx) =>
      authenticateRequestPrincipal(ctx, authenticators).then(
        ({ tenantId }) => tenantId,
      ),
    );

/** @param {unknown} model */
const tenantOfModel = (model) =>
  TENANTS.find((tenantId) => GetModel(RoleModel, tenantId) === model);

/**
 * Registers `GET location`, its handler answering the tenant of the model it
 * was given and the tenant the guard passed for.
 *
 * @param {string} location
 * @param {(prototype: object) => void} decorate
 * @param {(controller: Record<string, unknown>, args: unknown[]) => { model: unknown, principal?: unknown }} pick
 */
function route(location, decorate, pick) {
  class Probe extends Controller("/") {
    /** @param {unknown[]} args */
    handler(...args) {
      const { model, principal } = pick(this, args);
      return { model: tenantOfModel(model), guard: principal };
    }
  }
  decorate(Probe.prototype);
  const descriptor = Object.getOwnPropertyDescriptor(
    Probe.prototype,
    "handler",
  );
  if (!descriptor) throw new Error("The probe has no handler");
  Get(location)(Probe.prototype, "handler", descriptor);
}

route(
  "/probe/properties",
  (prototype) => {
    TenantScopedModel(RoleModel)(prototype, "model");
    CredentialGuard()(prototype, "principal");
  },
  ({ model, principal }) => ({ model, principal }),
);
route(
  "/probe/model-first",
  (prototype) => {
    TenantScopedModel(RoleModel)(prototype, "handler", 0);
    CredentialGuard()(prototype, "handler", 1);
  },
  (_, [model, principal]) => ({ model, principal }),
);
route(
  "/probe/guard-first",
  (prototype) => {
    CredentialGuard()(prototype, "handler", 0);
    TenantScopedModel(RoleModel)(prototype, "handler", 1);
  },
  (_, [principal, model]) => ({ model, principal }),
);
route(
  "/probe/route-credential",
  (prototype) => {
    TenantScopedModel(RoleModel)(prototype, "handler", 0);
    CredentialGuard([opaqueCredential])(prototype, "handler", 1);
  },
  (_, [model, principal]) => ({ model, principal }),
);
route(
  "/probe/model-property-guard-parameter",
  (prototype) => {
    TenantScopedModel(RoleModel)(prototype, "model");
    CredentialGuard([opaqueCredential])(prototype, "handler", 0);
  },
  ({ model }, [principal]) => ({ model, principal }),
);
route(
  "/probe/no-guard",
  (prototype) => TenantScopedModel(RoleModel)(prototype, "handler", 0),
  (_, [model]) => ({ model }),
);

const GUARDED = [
  "/probe/properties",
  "/probe/model-first",
  "/probe/guard-first",
];

await test("a tenant-scoped model next to a tenant guard reads the caller's workspace", async () => {
  for (const location of GUARDED) {
    for (const tenantId of [TENANT_A, TENANT_B]) {
      assert.deepEqual(
        await serveRoute(location, bearer(jwt(tenantId))),
        { status: OK, body: { model: tenantId, guard: tenantId } },
        `${location} for ${tenantId}`,
      );
    }
  }
});

await test("a tenant-scoped model next to a route credential reads that credential's workspace", async () => {
  for (const tenantId of [TENANT_A, TENANT_B]) {
    assert.deepEqual(
      await serveRoute("/probe/route-credential", bearer(opaque(tenantId))),
      { status: OK, body: { model: tenantId, guard: tenantId } },
    );
  }
});

await test("a credential that binds after the model read the default workspace is refused", async () => {
  const served = await serveRoute(
    "/probe/model-property-guard-parameter",
    bearer(opaque(TENANT_A)),
  );
  assert.equal(served.status, UNAUTHORIZED);
});

await test("a request without a verified credential reads the default workspace", async () => {
  for (const authorization of [undefined, bearer("not-a-token")]) {
    assert.deepEqual(await serveRoute("/probe/no-guard", authorization), {
      status: OK,
      body: { model: DEFAULT_TENANT_ID, guard: undefined },
    });
  }
  assert.deepEqual(await serveRoute("/probe/no-guard", bearer(jwt(TENANT_B))), {
    status: OK,
    body: { model: TENANT_B, guard: undefined },
  });
});

await test("a guard refusing the credential refuses the route", async () => {
  for (const location of GUARDED) {
    const served = await serveRoute(location, bearer(opaque(TENANT_A)));
    assert.equal(served.status, UNAUTHORIZED, location);
  }
});
