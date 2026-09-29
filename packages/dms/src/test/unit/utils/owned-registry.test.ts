import {
  Events,
  type ModuleExecutionContext,
  RunWithModuleContext,
} from "@antelopejs/interface-core/modules";
import { OwnedRegistry } from "@antelopejs/interface-dms/utils/owned-registry";
import { expect } from "chai";

function generation(module: string, index: number): ModuleExecutionContext {
  return { module, owner: `${module}#${index}` };
}

function addAs<V>(
  context: ModuleExecutionContext,
  registry: OwnedRegistry<V>,
  value: V,
): void {
  RunWithModuleContext(context, () => registry.add(value));
}

// What the core does when it takes a module generation down: the event runs in
// the departing generation's context, which names the owner released with it.
function destroy(context: ModuleExecutionContext): void {
  RunWithModuleContext(context, () => {
    Events.ModuleDestroyed.emit(context.module);
  });
}

describe("[unit] utils/owned-registry", () => {
  it("releases what a generation added when it is destroyed, and only that", () => {
    const registry = new OwnedRegistry<string>();
    const reloaded = generation("owned-registry-reloaded", 1);
    const other = generation("owned-registry-other", 1);
    addAs(reloaded, registry, "reloaded");
    addAs(other, registry, "other");

    destroy(reloaded);
    expect(registry.values()).to.deep.equal(["other"]);

    destroy(other);
    expect(registry.values()).to.deep.equal([]);
  });

  it("keeps what the next generation of the same module adds", () => {
    const registry = new OwnedRegistry<string>();
    const first = generation("owned-registry-next", 1);
    const next = generation("owned-registry-next", 2);
    addAs(first, registry, "first");
    destroy(first);

    addAs(next, registry, "next");

    expect(registry.values()).to.deep.equal(["next"]);
    destroy(next);
  });

  it("lists the live values in the order they were added", () => {
    const registry = new OwnedRegistry<string>();
    const owner = generation("owned-registry-order", 1);
    for (const value of ["first", "second", "third"]) {
      addAs(owner, registry, value);
    }

    expect(registry.values()).to.deep.equal(["first", "second", "third"]);
    destroy(owner);
  });

  it("removes only the oldest registration a matcher accepts", () => {
    const registry = new OwnedRegistry<string>();
    const owner = generation("owned-registry-remove", 1);
    for (const value of ["twice", "once", "twice"]) {
      addAs(owner, registry, value);
    }

    registry.remove((value) => value === "twice");

    expect(registry.values()).to.deep.equal(["once", "twice"]);
    expect(registry.has((value) => value === "once")).to.equal(true);
    expect(registry.has((value) => value === "never")).to.equal(false);
    destroy(owner);
  });
});
