import type {
  AddFrontendModuleOptions,
  FrontendPublicEndpoint,
} from "@antelopejs/interface-dms/page";
import { expect } from "chai";
import {
  AddFrontendModule,
  GetFrontendModules,
} from "../../../../implementations/dms/page";

const RENDERER = { name: "public-endpoints-test", version: "1" };

function register(name: string, publicEndpoints?: FrontendPublicEndpoint[]) {
  const config: AddFrontendModuleOptions = {
    name,
    sourcePath: process.cwd(),
    renderer: RENDERER,
  };
  if (publicEndpoints) config.publicEndpoints = publicEndpoints;
  AddFrontendModule(config);
}

function endpointsOf(name: string): FrontendPublicEndpoint[] | undefined {
  return GetFrontendModules().find((module) => module.name === name)
    ?.publicEndpoints;
}

describe("[unit] frontend module public endpoints", () => {
  it("defaults to declaring none", () => {
    register("public-none");
    expect(endpointsOf("public-none")).to.deep.equal([]);
  });

  it("spells out the methods and lowercases the headers", () => {
    register("public-declared", [
      {
        path: "/api/mailing/events/*/*",
        headers: ["X-Mailing-Webhook-Secret"],
      },
      { path: "/api/hooks/stripe", methods: ["post", "PUT"] },
    ]);
    expect(endpointsOf("public-declared")).to.deep.equal([
      {
        path: "/api/mailing/events/*/*",
        methods: ["POST"],
        headers: ["x-mailing-webhook-secret"],
      },
      { path: "/api/hooks/stripe", methods: ["POST", "PUT"], headers: [] },
    ]);
  });

  it("hands out a copy the caller cannot use to widen the declaration", () => {
    register("public-copy", [{ path: "/api/hooks/stripe" }]);
    endpointsOf("public-copy")?.[0]?.headers?.push("x-other");
    expect(endpointsOf("public-copy")?.[0]?.headers).to.deep.equal([]);
  });

  for (const endpoint of [
    { path: "/hooks/stripe" },
    { path: "/api/../auth/login" },
    { path: "/api/hooks?token=1" },
    { path: "/api/hooks/**" },
    { path: "/api" },
    { path: "/api/" },
    { path: "/api/*" },
    { path: "/api/*/events" },
    { path: "/api//hooks" },
    { path: "/api/hooks/" },
    { path: "/api/hooks/../../auth/login" },
    { path: "/api/hooks/./stripe" },
    { path: "/api/%2e%2e/auth/login" },
    { path: "/api/hooks\\..\\auth" },
    { path: "/api/hooks", methods: [] },
    { path: "/api/hooks", methods: ["TRACE"] },
    { path: "/api/hooks", headers: ["authorization"] },
    { path: "/api/hooks", headers: ["x-forwarded-host"] },
    { path: "/api/hooks", headers: ["x-dms-oauth-relay"] },
    "/api/hooks" as unknown as FrontendPublicEndpoint,
  ]) {
    it(`refuses to register ${JSON.stringify(endpoint)}`, () => {
      expect(() => register("public-invalid", [endpoint])).to.throw(
        /invalid publicEndpoints/,
      );
    });
  }
});
