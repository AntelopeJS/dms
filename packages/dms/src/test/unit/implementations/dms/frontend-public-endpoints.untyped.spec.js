import { expect } from "chai";
import { AddFrontendModule } from "../../../../implementations/dms/page";

const RENDERER = { name: "public-endpoints-test", version: "1" };

/**
 * @param {string} name
 * @param {unknown[]} publicEndpoints
 */
function register(name, publicEndpoints) {
  AddFrontendModule({
    name,
    sourcePath: process.cwd(),
    renderer: RENDERER,
    publicEndpoints,
  });
}

describe("[unit] frontend module public endpoints", () => {
  it('refuses to register "/api/hooks"', () => {
    expect(() => register("public-invalid", ["/api/hooks"])).to.throw(
      /invalid publicEndpoints/,
    );
  });
});
