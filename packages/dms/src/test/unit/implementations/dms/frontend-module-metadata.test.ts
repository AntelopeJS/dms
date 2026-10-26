import { expect } from "chai";
import {
  AddFrontendModule,
  GetFrontendModules,
} from "../../../../implementations/dms/page";
import { FrontendModulesChanged } from "@antelopejs/interface-dms/page";

const RENDERER = { name: "metadata-test", version: "1" };
const LOWER_PRIORITY = -2;
const HIGHER_PRIORITY = 8;

describe("[unit] frontend module metadata", () => {
  it("returns ordered public source snapshots without exposing mutable registration state", () => {
    for (const priority of [HIGHER_PRIORITY, LOWER_PRIORITY]) {
      AddFrontendModule({
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
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Frontend options are arbitrary JSON in the owner contract; preserve the existing check before mutating the nested snapshot.
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
});

describe("[unit] frontend modules changed event", () => {
  it("fires when a module registers its frontend", () => {
    let fired = 0;
    const onChange = () => {
      fired += 1;
    };
    FrontendModulesChanged.register(onChange);
    try {
      AddFrontendModule({
        name: "metadata-event",
        sourcePath: process.cwd(),
        renderer: RENDERER,
      });
    } finally {
      FrontendModulesChanged.unregister(onChange);
    }
    expect(fired).to.equal(1);
    expect(
      GetFrontendModules().some((module) => module.name === "metadata-event"),
    ).to.equal(true);
  });
});
