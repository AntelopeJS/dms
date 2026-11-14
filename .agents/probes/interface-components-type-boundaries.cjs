const path = require("node:path");

const root = process.argv[2];

/** api-diff runs a scratch copy of this file, so relative requires must start from the tree under test. */
module.filename = path.join(root, ".agents/probes/interface-components-type-boundaries.cjs");

const assert = require("node:assert/strict");
const { IncomingMessage, ServerResponse } = require("node:http");
const { Socket } = require("node:net");
const { HTTPResult } = require("../../packages/interface-dms/node_modules/@antelopejs/interface-api");

/**
 * @param {import("node:http").IncomingHttpHeaders} headers
 * @returns {import("../../packages/interface-dms/node_modules/@antelopejs/interface-api").RequestContext}
 */
function requestContext(headers) {
  const rawRequest = new IncomingMessage(new Socket());
  rawRequest.headers = headers;
  return {
    rawRequest,
    rawResponse: new ServerResponse(rawRequest),
    url: new URL("http://probe/"),
    routeParameters: {},
    response: new HTTPResult(),
  };
}

/**
 * Builds an object that inherits from `prototype` and owns `own`, as `Object.create(prototype)` followed by `Object.assign` does.
 * @param {object} prototype
 * @param {Record<string, unknown>} own
 */
function inherit(prototype, own) {
  const created = {};
  Object.setPrototypeOf(created, prototype);
  return Object.assign(created, own);
}

async function observeTypeBoundaries() {
  const api = require("../../packages/interface-dms/node_modules/@antelopejs/interface-api");
  const { CreateJwtAuthDecorator } = require("../../packages/interface-dms/dist/auth/internal/jwt-auth-decorator.js");
  const { getAuthenticatedRequestTenantId } = require("../../packages/interface-dms/dist/auth/internal/request-authenticators.js");
  const { isPrimitive } = require("../../packages/interface-dms/dist/utils/internal/type-check.js");
  const { CreateDataType } = require("../../packages/interface-dms/dist/base/data-types/index.js");
  const { collectFileRefs, remapRecordFileKeys } = require("../../packages/interface-dms/dist/base/helpers/file-refs.js");
  const { RegistrationIdentity } = require("../../packages/interface-dms/dist/page/internal/registry.js");
  const priorProvider = api.SetParameterProvider;
  const authenticated = [];
  /** @type {unknown[]} */
  const reads = [];
  /** @type {{ provide(context: ReturnType<typeof requestContext>): unknown } | undefined} */
  let provider;
  api.SetParameterProvider = (_target, _key, _index, value) => { provider = { provide: value }; };
  try {
    for (const value of [null, false, 17, "plain", {}, { _id: 23 }, inherit({
      /** @this {{ marker?: number }} */
      get _id() { reads.push(this.marker === 31); return "user-31"; },
    }, { marker: 31 })]) {
      const decorate = CreateJwtAuthDecorator({
        authenticator: async () => ({ tenantId: "tenant-17" }),
        validator: async () => value,
      });
      decorate()({}, "user");
      const ctx = requestContext({ authorization: "Bearer token" });
      assert.ok(provider);
      const result = await provider.provide(ctx);
      authenticated.push({
        identity: result === value,
        tenant: getAuthenticatedRequestTenantId(ctx) ?? null,
      });
    }
  } finally {
    api.SetParameterProvider = priorProvider;
  }
  /** @type {unknown[]} */
  const keyReads = [];
  const node = inherit({
    get key() { keyReads.push(this === node); return "image-17"; },
  }, { extra: 31 });
  const columns = { image: { type: CreateDataType("image", { storage: "proof" }) } };
  const refs = collectFileRefs(columns, { image: node });
  const remapped = await remapRecordFileKeys(columns, { image: node }, async (key, storage) => `${storage}/${key}`);
  const identity = new RegistrationIdentity("typed-local-probe");
  const original = {};
  identity.remember(original);
  let tokenReads = 0;
  const view = new Proxy(original, {
    get(target, key) {
      if (key === Symbol.for("@antelopejs/interface-dms:pageRegistration")) tokenReads++;
      /** @type {unknown} */
      const value = Object.getOwnPropertyDescriptor(target, key)?.value;
      return value;
    },
  });
  return {
    authenticated,
    reads,
    primitives: [undefined, null, false, 0, "text", 17n, Symbol("x"), {}, [], () => 1].map(isPrimitive),
    refs,
    remapped,
    keyReads,
    resolved: identity.resolve(view) === original,
    tokenReads,
  };
}

observeTypeBoundaries()
  .then((typeBoundaries) => process.stdout.write(JSON.stringify({ typeBoundaries })))
  .catch((/** @type {unknown} */ error) => {
    process.stderr.write(String(error instanceof Error ? error.stack : error));
    process.exitCode = 1;
  });
