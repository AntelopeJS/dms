import { expect } from "chai";
import { Form } from "@antelopejs/interface-dms/base/form";
import { resolveFormFooterAliases } from "@antelopejs/interface-dms/base/internal/form-footer";

const optionsOf = (form: ReturnType<typeof Form>) =>
  form.serializeSync().options ?? {};

/**
 * A form's footer reads two options, `saveMode` and `kind`; the flags they
 * replace are still read in 0.4 and never reach the client.
 */
describe("[unit] interfaces/dms-base — form footer options", () => {
  it("leaves a form declaring neither to the defaults", () => {
    const options = optionsOf(Form({ fields: [] }));
    expect(options).to.not.have.any.keys("saveMode", "kind");
  });

  it("reads the former flags into saveMode and kind, and drops them", () => {
    expect(
      resolveFormFooterAliases({ fields: [], saveBar: true }),
    ).to.deep.equal({ fields: [], saveMode: "bar" });
    expect(
      resolveFormFooterAliases({ fields: [], showActions: false }),
    ).to.deep.equal({ fields: [], saveMode: "none" });
    expect(
      resolveFormFooterAliases({ fields: [], saveBar: false }),
    ).to.deep.equal({ fields: [], saveMode: "footer" });
    expect(
      resolveFormFooterAliases({ fields: [], cancellable: false }),
    ).to.deep.equal({ fields: [], kind: "action" });
    expect(
      resolveFormFooterAliases({ fields: [], cancellable: true }),
    ).to.deep.equal({ fields: [], kind: "record" });
  });

  it("lets saveMode and kind win over the former flags", () => {
    const options = optionsOf(
      Form({
        fields: [],
        saveMode: "footer",
        saveBar: true,
        kind: "action",
        cancellable: true,
      }),
    );
    expect(options).to.include({ saveMode: "footer", kind: "action" });
    expect(options).to.not.have.any.keys("saveBar", "cancellable");
  });
});
