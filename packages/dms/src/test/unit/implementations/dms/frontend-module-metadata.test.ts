import { expect } from "chai";
import { GetOwnedFrontendModuleName } from "../../../../implementations/dms/frontend-modules";
import {
  AddOwnedFrontendModule,
  GetFrontendModules,
} from "../../../../implementations/dms/page";

const RENDERER = { name: "metadata-test", version: "1" };
const LOWER_PRIORITY = -2;
const HIGHER_PRIORITY = 8;

describe("[unit] frontend module metadata", () => {
  it("returns ordered public source snapshots without exposing mutable registration state", () => {
    for (const priority of [HIGHER_PRIORITY, LOWER_PRIORITY]) {
      AddOwnedFrontendModule({
        name: `metadata-${priority}`,
        sourcePath: process.cwd(),
        renderer: new Proxy(RENDERER, {}),
        priority,
        options: new Proxy({ locale: new Proxy({ editable: true }, {}) }, {}),
        privateOptions: { secret: "must-not-be-returned" },
      });
    }
    const modules = GetFrontendModules().filter(
      (module) => module.renderer.name === RENDERER.name,
    );
    expect(modules.map((module) => module.priority)).to.deep.equal([
      LOWER_PRIORITY,
      HIGHER_PRIORITY,
    ]);
    expect(modules[0]).to.not.have.property("privateOptions");
    expect(modules[0].sourcePath).to.equal(process.cwd());
    const locale = modules[0].options.locale;
    if (!locale || typeof locale !== "object" || Array.isArray(locale)) {
      throw new Error("Expected nested locale options");
    }
    locale.editable = false;
    modules[0].renderer.name = "mutated";
    const original = GetFrontendModules().find(
      (module) => module.name === `metadata-${LOWER_PRIORITY}`,
    );
    expect(original?.options).to.deep.equal({ locale: { editable: true } });
    expect(original?.renderer).to.deep.equal(RENDERER);
  });

  it("names the first frontend module each module added, and none for a module without one", () => {
    const owner = "metadata-owner";
    for (const name of ["metadata-owned", "metadata-owned-later"]) {
      AddOwnedFrontendModule(
        { name, sourcePath: process.cwd(), renderer: RENDERER },
        owner,
      );
    }
    AddOwnedFrontendModule(
      {
        name: "metadata-unowned",
        sourcePath: process.cwd(),
        renderer: RENDERER,
      },
      undefined,
    );

    expect(GetOwnedFrontendModuleName(owner)).to.equal("metadata-owned");
    expect(GetOwnedFrontendModuleName("metadata-no-frontend")).to.equal(
      undefined,
    );
    expect(GetOwnedFrontendModuleName(undefined)).to.equal(undefined);
  });
});
