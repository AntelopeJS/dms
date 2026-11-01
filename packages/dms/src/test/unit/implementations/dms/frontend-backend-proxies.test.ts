import type {
  AddFrontendModuleOptions,
  FrontendBackendProxy,
} from "@antelopejs/interface-dms/page";
import { expect } from "chai";
import {
  AddFrontendModule,
  GetFrontendModules,
} from "../../../../implementations/dms/page";

const RENDERER = { name: "backend-proxies-test", version: "1" };

function register(name: string, backendProxies?: FrontendBackendProxy[]) {
  const config: AddFrontendModuleOptions = {
    name,
    sourcePath: process.cwd(),
    renderer: RENDERER,
  };
  if (backendProxies) config.backendProxies = backendProxies;
  AddFrontendModule(config);
}

function proxiesOf(name: string): FrontendBackendProxy[] | undefined {
  return GetFrontendModules().find((module) => module.name === name)
    ?.backendProxies;
}

describe("[unit] frontend module backend proxies", () => {
  it("defaults to declaring none", () => {
    register("proxies-none");
    expect(proxiesOf("proxies-none")).to.deep.equal([]);
  });

  it("spells out the session auth when none is given", () => {
    register("proxies-declared", [
      { path: "/media/**", auth: "none" },
      { path: "/webhooks/acme/*" },
      { path: "/exports/*/download" },
    ]);
    expect(proxiesOf("proxies-declared")).to.deep.equal([
      { path: "/media/**", auth: "none" },
      { path: "/webhooks/acme/*", auth: "session" },
      { path: "/exports/*/download", auth: "session" },
    ]);
  });

  it("hands out a copy the caller cannot use to change the declaration", () => {
    register("proxies-copy", [{ path: "/media/**", auth: "none" }]);
    const copy = proxiesOf("proxies-copy");
    if (copy?.[0]) copy[0].auth = "session";
    expect(proxiesOf("proxies-copy")?.[0]?.auth).to.equal("none");
  });

  const invalidAuthentication: FrontendBackendProxy = {
    path: "/media/**",
    // @ts-expect-error Deliberately unsupported authentication tests runtime rejection of an untyped registration.
    auth: "bearer",
  };

  for (const proxy of [
    { path: "media/**" },
    { path: "/" },
    { path: "/**" },
    { path: "/*/files" },
    { path: "/media/**/x" },
    { path: "/media/" },
    { path: "/media//x" },
    { path: "/media/../api" },
    { path: "/media?x=1" },
    { path: "/api/_dms/**" },
    { path: "/assets/**" },
    { path: "/@vite/**" },
    { path: "/node_modules/**" },
    invalidAuthentication,
    // SAFETY: Intentionally pass a string where the registration contract requires an object to exercise runtime rejection.
    "/media/**" as unknown as FrontendBackendProxy,
  ]) {
    it(`refuses to register ${JSON.stringify(proxy)}`, () => {
      expect(() => register("proxies-invalid", [proxy])).to.throw(
        /invalid backendProxies/,
      );
    });
  }
});
