import type { AddFrontendModuleOptions } from "@antelopejs/interface-dms/page";
import { expect } from "chai";
import {
  AddFrontendModule,
  GetFrontendModules,
} from "../../../../implementations/dms/page";

const RENDERER = { name: "establish-test", version: "1" };

function register(name: string, authEstablishEndpoints?: string[]) {
  const config: AddFrontendModuleOptions = {
    name,
    sourcePath: process.cwd(),
    renderer: RENDERER,
  };
  if (authEstablishEndpoints) {
    config.authEstablishEndpoints = authEstablishEndpoints;
  }
  AddFrontendModule(config);
}

function endpointsOf(name: string): string[] | undefined {
  return GetFrontendModules().find((module) => module.name === name)
    ?.authEstablishEndpoints;
}

describe("[unit] frontend module establish endpoints", () => {
  it("defaults to declaring none", () => {
    register("establish-none");
    expect(endpointsOf("establish-none")).to.deep.equal([]);
  });

  it("keeps declared endpoints in order, without duplicates", () => {
    register("establish-declared", [
      "/api/saas/register/finalize",
      "/api/invitations/redeem",
      "/api/saas/register/finalize",
    ]);
    expect(endpointsOf("establish-declared")).to.deep.equal([
      "/api/saas/register/finalize",
      "/api/invitations/redeem",
    ]);
  });

  it("hands out a copy the caller cannot use to widen the allow-list", () => {
    register("establish-copy", ["/api/saas/register/finalize"]);
    endpointsOf("establish-copy")?.push("/api/auth/login");
    expect(endpointsOf("establish-copy")).to.deep.equal([
      "/api/saas/register/finalize",
    ]);
  });

  for (const endpoint of [
    "/saas/register/finalize",
    "api/saas/register/finalize",
    "/api/saas/../auth/login",
    "/api/saas/register/finalize?token=1",
    "https://evil.example.com/api/auth/login",
    "/api/",
    "",
  ]) {
    it(`refuses to register ${JSON.stringify(endpoint)}`, () => {
      expect(() => register("establish-invalid", [endpoint])).to.throw(
        /invalid authEstablishEndpoints/,
      );
    });
  }
});
