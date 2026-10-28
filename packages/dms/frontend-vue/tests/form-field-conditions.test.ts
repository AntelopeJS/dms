import { describe, expect, it } from "vitest";
import {
  isFieldMarkedRequired,
  withConditionFields,
} from "../layers/dms-ui/app/composables/form/useForm";

const lostReason = {
  id: "lostReason",
  required: true,
  type: "string",
  visibleWhen: { field: "stage", in: ["lost"] },
};
const probability = {
  id: "probability",
  type: "number",
  disabledWhen: { field: "stage", in: ["won", "lost"] },
};
const vatNumber = {
  id: "vatNumber",
  type: "string",
  visibleWhen: { field: "kind", in: [null, "business"] },
};
const fields = [lostReason, probability, vatNumber];

describe("withConditionFields", () => {
  it("hides and locks the fields of the values the form opens with", () => {
    const open = withConditionFields(
      fields,
      { stage: "lead", kind: "individual" },
      {},
    );
    expect([...open.hidden].sort()).to.deep.equal(["lostReason", "vatNumber"]);
    expect([...open.disabled]).to.deep.equal([]);

    const lost = withConditionFields(
      fields,
      { stage: "lost", kind: "business" },
      {},
    );
    expect([...lost.hidden]).to.deep.equal([]);
    expect([...lost.disabled]).to.deep.equal(["probability"]);
  });

  it("matches an empty field on null", () => {
    const empty = withConditionFields(fields, { stage: "lead" }, {});
    expect(empty.hidden.has("vatNumber")).to.equal(false);
  });

  it("keeps the fields the watches hide or disable", () => {
    const watched = {
      hidden: new Set(["position"]),
      disabled: new Set(["owner"]),
    };
    const result = withConditionFields(
      fields,
      { stage: "won", kind: "business" },
      watched,
    );
    expect([...result.hidden].sort()).to.deep.equal(["lostReason", "position"]);
    expect([...result.disabled].sort()).to.deep.equal(["owner", "probability"]);

    expect([...watched.hidden]).to.deep.equal(["position"]);
  });

  it("requires a mandatory field only while it shows", () => {
    const hidden = withConditionFields(fields, { stage: "lead" }, {});
    expect(
      isFieldMarkedRequired(
        lostReason,
        hidden.disabled,
        hidden.hidden,
        undefined,
      ),
    ).to.equal(false);
    const shown = withConditionFields(fields, { stage: "lost" }, {});
    expect(
      isFieldMarkedRequired(
        lostReason,
        shown.disabled,
        shown.hidden,
        undefined,
      ),
    ).to.equal(true);
  });
});
