import { expect } from "chai";
import { AddFrontendModule } from "../../../../implementations/dms/page";

const RENDERER = { name: "backend-proxies-test", version: "1" };

/**
 * @param {string} name
 * @param {unknown[]} backendProxies
 */
function register(name, backendProxies) {
  AddFrontendModule({
    name,
    sourcePath: process.cwd(),
    renderer: RENDERER,
    backendProxies,
  });
}

describe("[unit] frontend module backend proxies", () => {
  for (const proxy of [{ path: "/media/**", auth: "bearer" }, "/media/**"]) {
    it(`refuses to register ${JSON.stringify(proxy)}`, () => {
      expect(() => register("proxies-invalid", [proxy])).to.throw(
        /invalid backendProxies/,
      );
    });
  }
});
