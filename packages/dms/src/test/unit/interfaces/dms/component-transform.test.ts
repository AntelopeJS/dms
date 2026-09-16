import { expect } from "chai";
import { ComponentBuilder } from "@antelopejs/interface-dms/component";

interface DemoOptions {
  label: string;
  stamp?: string;
}

describe("[unit] interfaces/dms/component — transformOptions", () => {
  it("finalizes the options during async serialization", async () => {
    const builder = new ComponentBuilder<DemoOptions>("demo")
      .options({ label: "hello" })
      .transformOptions(async (options) =>
        options ? { ...options, stamp: `${options.label}-stamped` } : options,
      );

    const serialized = await builder.serialize();

    expect(serialized.options).to.deep.equal({
      label: "hello",
      stamp: "hello-stamped",
    });
  });

  it("composes transforms in registration order", async () => {
    const builder = new ComponentBuilder<DemoOptions>("demo")
      .options({ label: "a" })
      .transformOptions((options) =>
        options ? { ...options, label: `${options.label}b` } : options,
      )
      .transformOptions((options) =>
        options ? { ...options, label: `${options.label}c` } : options,
      );

    const serialized = await builder.serialize();

    expect(serialized.options?.label).to.equal("abc");
  });

  // Serialization can run more than once — a hot reload re-registers the
  // page — so each pass must start from the untransformed declaration.
  it("starts from the original options on every serialization", async () => {
    const builder = new ComponentBuilder<DemoOptions>("demo")
      .options({ label: "x" })
      .transformOptions((options) =>
        options ? { ...options, label: `${options.label}!` } : options,
      );

    await builder.serialize();
    const second = await builder.serialize();

    expect(second.options?.label).to.equal("x!");
  });

  // Synchronous serialization is how a component gets embedded into another
  // component's options: the host's transform finalizes what it embeds, so
  // the embedded component's own transforms are deliberately skipped.
  it("skips transforms on synchronous serialization", () => {
    const builder = new ComponentBuilder<DemoOptions>("demo")
      .options({ label: "hello" })
      .transformOptions((options) =>
        options ? { ...options, stamp: "never" } : options,
      );

    expect(builder.serializeSync().options).to.deep.equal({ label: "hello" });
  });

  it("leaves untransformed builders serializing synchronously", () => {
    const builder = new ComponentBuilder<DemoOptions>("demo").options({
      label: "hello",
    });

    expect(builder.serializeSync().options).to.deep.equal({ label: "hello" });
  });
});
