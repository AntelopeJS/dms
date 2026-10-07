import { expect } from "chai";
import { Form } from "@antelopejs/interface-dms/base/form";

const optionsOf = (form: ReturnType<typeof Form>) =>
  form.serializeSync().options ?? {};

/** A form's footer reads two options, `saveMode` and `kind`. */
describe("[unit] interfaces/dms-base — form footer options", () => {
  it("leaves a form declaring neither to the defaults", () => {
    const options = optionsOf(Form({ fields: [] }));
    expect(options).to.not.have.any.keys("saveMode", "kind");
  });
});
