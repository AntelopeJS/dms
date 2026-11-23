import { expect } from "chai";
import { Form } from "@antelopejs/interface-dms/base/form";

const optionsOf = (form: ReturnType<typeof Form>) =>
  form.serializeSync().options ?? {};

describe("[unit] interfaces/dms-base — form footer options, `saveMode` and `kind`", () => {
  it("leaves a form declaring neither to the defaults", () => {
    const options = optionsOf(Form({ fields: [] }));
    expect(options).to.not.have.any.keys("saveMode", "kind");
  });
});
