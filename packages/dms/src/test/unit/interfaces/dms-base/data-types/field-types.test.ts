import { expect } from "chai";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";

const ITEMS = [
  { label: "Low", value: "low", description: "When there is time" },
  { label: "High", value: "high" },
];

const componentOf = (type: { inputComponent(): { componentName: string } }) =>
  type.inputComponent().componentName;

describe("[unit] interfaces/dms-base — SelectType display", () => {
  it("renders a dropdown by default, cards, segments or radios when asked", () => {
    const select = (display?: DefaultDataTypes.SelectTypeOptions["display"]) =>
      new DefaultDataTypes.SelectType({ items: ITEMS, display });

    expect(componentOf(select())).to.equal("dms-select");
    expect(componentOf(select("cards"))).to.equal("dms-choice-cards");
    expect(componentOf(select("segmented"))).to.equal("dms-segmented-select");
    expect(componentOf(select("radio"))).to.equal("dms-radio-group");
  });

  it("shows cards for a multiple select asked to pick one way", () => {
    const select = new DefaultDataTypes.SelectType({
      items: ITEMS,
      multiple: true,
      display: "segmented",
    });
    const component = select.inputComponent();
    expect(component.componentName).to.equal("dms-choice-cards");
    expect(component.options).to.deep.equal({ items: ITEMS, multiple: true });
  });

  it("filters with a dropdown, whatever the form shows", () => {
    const select = new DefaultDataTypes.SelectType({
      items: ITEMS,
      display: "cards",
    });
    const filter = select.filterComponents().default;
    expect(filter.componentName).to.equal("dms-select");
    expect(filter.options).to.not.have.property("display");
  });
});

describe("[unit] interfaces/dms-base — BooleanType display", () => {
  it("renders a switch, a checkbox or a card with its texts", () => {
    const options = { label: "Owner", description: "Holds every permission" };
    expect(componentOf(new DefaultDataTypes.BooleanType())).to.equal(
      "dms-switch",
    );
    expect(
      new DefaultDataTypes.BooleanType({
        ...options,
        display: "checkbox",
      }).inputComponent().componentName,
    ).to.equal("dms-checkbox");
    const card = new DefaultDataTypes.BooleanType({
      ...options,
      display: "card",
      icon: "i-ph-crown",
    }).inputComponent();
    expect(card.componentName).to.equal("dms-boolean-card");
    expect(card.options).to.deep.equal({ ...options, icon: "i-ph-crown" });
  });
});

describe("[unit] interfaces/dms-base — StringType copyable", () => {
  it("shows a value to copy, and keeps a text input to filter it", () => {
    const type = new DefaultDataTypes.StringType({ copyable: true });
    expect(componentOf(type)).to.equal("dms-copyable-text");
    expect(type.filterComponents().default.componentName).to.equal(
      "dms-input-text",
    );
  });
});

describe("[unit] interfaces/dms-base — ArrayType", () => {
  const headers = () =>
    new DefaultDataTypes.ArrayType({
      of: {
        name: { type: new DefaultDataTypes.StringType(), required: true },
        value: new DefaultDataTypes.StringType(),
      },
      min: 1,
      max: 2,
      sortable: true,
      addLabel: "Add header",
    });

  it("validates a list of rows, each an object of its fields", () => {
    const validation = headers().getValidation();
    expect(validation.safeParse([{ name: "Accept", value: "*/*" }]).success).to
      .be.true;
    expect(validation.safeParse([{ name: "", value: "x" }]).success).to.be
      .false;
    expect(validation.safeParse([{ value: "x" }]).success).to.be.false;
    expect(validation.safeParse([]).success).to.be.false;
    expect(
      validation.safeParse([{ name: "a" }, { name: "b" }, { name: "c" }])
        .success,
    ).to.be.false;
  });

  it("renders a repeater, a column per field", () => {
    const component = headers().inputComponent();
    expect(component.componentName).to.equal("dms-repeater");
    const options = component.options as {
      columns: Array<{ id: string; label: string; type: string }>;
      sortable: boolean;
      addLabel: string;
    };
    expect(
      options.columns.map(({ id, label, type }) => [id, label, type]),
    ).to.deep.equal([
      ["name", "name", "string"],
      ["value", "value", "string"],
    ]);
    expect(options.sortable).to.equal(true);
    expect(options.addLabel).to.equal("Add header");
  });
});

describe("[unit] interfaces/dms-base — KeyValueType", () => {
  it("validates an object of named values", () => {
    const validation = new DefaultDataTypes.KeyValueType().getValidation();
    expect(validation.safeParse({ "Content-Type": "application/json" }).success)
      .to.be.true;
    expect(validation.safeParse({ "": "x" }).success).to.be.false;
    expect(validation.safeParse([["a", "b"]]).success).to.be.false;
  });

  it("holds { value, enabled } per key when toggleable", () => {
    const validation = new DefaultDataTypes.KeyValueType({
      toggleable: true,
      valueType: new DefaultDataTypes.NumberType(),
    }).getValidation();
    expect(
      validation.safeParse({ retries: { value: 3, enabled: false } }).success,
    ).to.be.true;
    expect(validation.safeParse({ retries: 3 }).success).to.be.false;
  });
});

describe("[unit] interfaces/dms-base — SecretType", () => {
  it("is revealable and copyable unless told otherwise", () => {
    const component = new DefaultDataTypes.SecretType({
      rotateUrl: "/api/mailing/webhook/rotate",
    }).inputComponent();
    expect(component.componentName).to.equal("dms-input-secret");
    expect(component.options).to.include({
      revealable: true,
      copyable: true,
      rotateUrl: "/api/mailing/webhook/rotate",
    });
  });
});

describe("[unit] interfaces/dms-base — CodeType", () => {
  it("refuses JSON that does not parse, with the field error's key", () => {
    const validation = new DefaultDataTypes.CodeType({
      language: "json",
    }).getValidation();
    expect(validation.safeParse('{ "a": 1 }').success).to.be.true;
    const refused = validation.safeParse("{ a: 1 }");
    expect(refused.success).to.be.false;
    expect(refused.error?.issues[0]?.message).to.equal(
      "$dms.field_errors.invalid_json",
    );
  });

  it("stores any text in another language", () => {
    const validation = new DefaultDataTypes.CodeType({
      language: "sql",
    }).getValidation();
    expect(validation.safeParse("select * from").success).to.be.true;
  });
});

describe("[unit] interfaces/dms-base — TagsType", () => {
  it("refuses an item that is no address, and more than max", () => {
    const validation = new DefaultDataTypes.TagsType({
      itemType: "email",
      max: 2,
    }).getValidation();
    expect(validation.safeParse(["a@b.co"]).success).to.be.true;
    expect(validation.safeParse(["nope"]).success).to.be.false;
    expect(validation.safeParse(["a@b.co", "c@d.co", "e@f.co"]).success).to.be
      .false;
  });
});
