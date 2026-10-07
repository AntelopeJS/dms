import { describe, expect, it } from "vitest";
import { ref } from "vue";
import {
  clearedFieldValue,
  collectSubmitData,
  isClearedFieldValue,
  localizedSubmitValue,
} from "../layers/dms-ui/app/composables/form/useForm";

/** A field as `collectSubmitData` reads it. */
const field = (id: string, type?: string, disabled?: boolean) => ({
  id,
  type,
  disabled,
});

/** A localized field, one value per language. */
const localizedField = (id: string, type = "string") => ({
  ...field(id, type),
  localized: true,
});

/**
 * Every field type the generic form renders, with a stored value and what
 * its control emits once cleared.
 */
const CLEARABLE = [
  { type: "string", stored: "Some text", cleared: undefined, sent: null },
  {
    type: "string",
    label: "emptied",
    stored: "Some text",
    cleared: "",
    sent: null,
  },
  {
    type: "string",
    label: "textarea",
    stored: "Line one\nLine two",
    cleared: "",
    sent: null,
  },
  { type: "email", stored: "ann@example.com", cleared: "", sent: null },
  { type: "url", stored: "https://example.com", cleared: "", sent: null },
  { type: "phone", stored: "+32 2 123 45 67", cleared: "", sent: null },
  { type: "rich_text", stored: "<p>Notes</p>", cleared: "<p></p>", sent: null },
  { type: "number", stored: 4, cleared: undefined, sent: null },
  { type: "number", label: "emptied", stored: 4, cleared: null, sent: null },
  { type: "number", label: "NaN", stored: 4, cleared: Number.NaN, sent: null },
  { type: "price", stored: 12.5, cleared: undefined, sent: null },
  {
    type: "date",
    stored: "2026-01-02T00:00:00.000Z",
    cleared: undefined,
    sent: null,
  },
  {
    type: "date",
    label: "range",
    stored: { start: "2026-01-02", end: "2026-01-05" },
    cleared: undefined,
    sent: null,
  },
  {
    type: "date",
    label: "multiple",
    stored: ["2026-01-02", "2026-01-05"],
    cleared: undefined,
    sent: [],
  },
  { type: "string_time", stored: 5400, cleared: undefined, sent: null },
  { type: "color", stored: "#3b82f6", cleared: undefined, sent: null },
  { type: "select", stored: "high", cleared: undefined, sent: null },
  {
    type: "select",
    label: "multiple",
    stored: ["a", "b"],
    cleared: undefined,
    sent: [],
  },
  {
    type: "cascader_relation",
    stored: "cat-1",
    cleared: undefined,
    sent: null,
  },
  { type: "tree", stored: "eng-frontend", cleared: undefined, sent: null },
  {
    type: "relation",
    stored: { _id: "3", name: "John Doe" },
    cleared: undefined,
    sent: null,
  },
  {
    type: "relation",
    label: "multiple",
    stored: [{ _id: "3", name: "John Doe" }],
    cleared: undefined,
    sent: [],
  },
  {
    type: "address",
    stored: {
      streetName: "Rue",
      postalCode: "1000",
      city: "Bxl",
      countryCode: "BE",
    },
    cleared: undefined,
    sent: null,
  },
  {
    type: "file",
    stored: "files/contract.pdf",
    cleared: undefined,
    sent: null,
  },
  {
    type: "image",
    stored: { key: "images/cover.png" },
    cleared: undefined,
    sent: null,
  },
] as const;

describe("collectSubmitData on an edit form", () => {
  for (const entry of CLEARABLE) {
    const name =
      "label" in entry ? `${entry.type} (${entry.label})` : entry.type;

    it(`sends a cleared ${name} as its empty value`, () => {
      expect(
        collectSubmitData(
          { value: entry.cleared },
          [field("value", entry.type)],
          {
            initialValues: { value: entry.stored },
          },
        ),
      ).toEqual({ value: entry.sent });
    });

    it(`sends an untouched ${name} as stored`, () => {
      expect(
        collectSubmitData(
          { value: entry.stored },
          [field("value", entry.type)],
          {
            initialValues: { value: entry.stored },
          },
        ),
      ).toEqual({ value: entry.stored });
    });
  }

  it("sends an emptied text as null, an emptied list as an empty list", () => {
    // A file or image control emits `null`, a multiple select `[]`, a text
    // input `""`: the text is a cleared field like the others.
    expect(
      collectSubmitData(
        { file: null, tags: [], title: "" },
        [
          field("file", "file"),
          field("tags", "select"),
          field("title", "string"),
        ],
        { initialValues: { file: "a.pdf", tags: ["x"], title: "Old" } },
      ),
    ).toEqual({ file: null, tags: [], title: null });
  });

  it("sends a number cleared to zero as zero, and an unticked box as false", () => {
    expect(
      collectSubmitData(
        { quantity: 0, done: false },
        [field("quantity", "number"), field("done", "boolean")],
        { initialValues: { quantity: 4, done: true } },
      ),
    ).toEqual({ quantity: 0, done: false });
  });

  it("sends no null for an empty text the row never had a value for", () => {
    expect(
      collectSubmitData(
        { name: "Task", phone: "", notes: "<p></p>", title: { en: "" } },
        [
          field("name", "string"),
          field("phone", "phone"),
          field("notes", "rich_text"),
          field("title", "string"),
        ],
        { initialValues: { name: "Task", phone: null, notes: "" } },
      ),
    ).toEqual({ name: "Task" });
  });

  it("leaves out an untouched empty text when only changes are sent", () => {
    expect(
      collectSubmitData(
        { name: "Task", phone: "" },
        [field("name", "string"), field("phone", "phone")],
        { initialValues: { name: "Task", phone: null }, onlyChanged: true },
      ),
    ).toEqual({});
  });

  it("leaves out a field the row never had a value for", () => {
    expect(
      collectSubmitData(
        { name: "Task", phone: undefined, color: undefined, tags: undefined },
        [
          field("name", "string"),
          field("phone", "phone"),
          field("color", "color"),
          field("tags", "select"),
        ],
        { initialValues: { name: "Task", phone: null, color: "", tags: [] } },
      ),
    ).toEqual({ name: "Task" });
  });

  it("clears only the field the user emptied, the others keep their values", () => {
    expect(
      collectSubmitData(
        { name: "Task", priority: "low", brandColor: undefined },
        [
          field("name", "string"),
          field("priority", "select"),
          field("brandColor", "color"),
        ],
        {
          initialValues: {
            name: "Task",
            priority: "low",
            brandColor: "#112233",
          },
        },
      ),
    ).toEqual({ name: "Task", priority: "low", brandColor: null });
  });

  it("never clears a disabled field", () => {
    const fields = [field("createdAt", "date", true), field("owner", "string")];
    expect(
      collectSubmitData({ createdAt: undefined, owner: undefined }, fields, {
        initialValues: { createdAt: "2026-01-01", owner: "Ann" },
        disabled: new Set(["owner"]),
      }),
    ).toEqual({});
  });

  it("clears a field of a group like any other", () => {
    // Groups reach `collectSubmitData` flattened: their fields are fields.
    expect(
      collectSubmitData(
        { email: "a@b.c", phone: undefined },
        [field("email", "email"), field("phone", "phone")],
        { initialValues: { email: "a@b.c", phone: "+32 2 123" } },
      ),
    ).toEqual({ email: "a@b.c", phone: null });
  });

  it("clears one language of a localized field, keeping the others", () => {
    const body = collectSubmitData(
      { title: { en: "", fr: "Titre" } },
      [localizedField("title")],
      { initialValues: { title: { en: "Title", fr: "Titre" } } },
    );
    expect(body).toEqual({ title: { en: "", fr: "Titre" } });
  });

  it("drops a language whose control emitted nothing from the body", () => {
    const body = collectSubmitData(
      { title: { en: undefined, fr: "Titre" } },
      [localizedField("title")],
      { initialValues: { title: { en: "Title", fr: "Titre" } } },
    );
    expect(JSON.parse(JSON.stringify(body))).toEqual({
      title: { fr: "Titre" },
    });
  });

  it("sends a localized field with every language emptied as empty languages", () => {
    // The database stores a localized field as one value per language and
    // cannot read a `null` back in its place.
    expect(
      collectSubmitData(
        { title: { en: "", fr: "" }, notes: { en: "<p></p>", fr: "" } },
        [localizedField("title"), localizedField("notes", "rich_text")],
        {
          initialValues: {
            title: { en: "Title", fr: "Titre" },
            notes: { en: "<p>Notes</p>" },
          },
        },
      ),
    ).toEqual({ title: { en: "", fr: "" }, notes: { en: "", fr: "" } });
  });

  it("unwraps a ref held in the state", () => {
    expect(
      collectSubmitData({ count: ref(3) }, [field("count", "number")]),
    ).toEqual({ count: 3 });
  });
});

describe("collectSubmitData on a create form", () => {
  it("sends no null for a text typed then emptied", () => {
    expect(
      collectSubmitData(
        { name: "New", description: "" },
        [field("name", "string"), field("description", "string")],
        { initialValues: {} },
      ),
    ).toEqual({ name: "New" });
  });

  it("sends no null for the fields nobody touched", () => {
    expect(
      collectSubmitData(
        { name: "New", color: undefined, tags: undefined, address: undefined },
        [
          field("name", "string"),
          field("color", "color"),
          field("tags", "select"),
          field("address", "address"),
        ],
        { initialValues: {} },
      ),
    ).toEqual({ name: "New" });
  });

  it("sends a field default the user cleared as cleared", () => {
    expect(
      collectSubmitData(
        { status: undefined, priority: "medium" },
        [field("status", "select"), field("priority", "select")],
        { initialValues: { status: "pending", priority: "medium" } },
      ),
    ).toEqual({ status: null, priority: "medium" });
  });

  it("puts the fields' values over the submit defaults", () => {
    expect(
      collectSubmitData(
        { project: "p-2", name: "New" },
        [field("project", "relation"), field("name", "string")],
        { submitDefaults: { project: "p-1", tenant: "t-1" } },
      ),
    ).toEqual({ project: "p-2", name: "New", tenant: "t-1" });
  });

  it("keeps a submit default over a field left empty", () => {
    expect(
      collectSubmitData(
        { project: undefined },
        [field("project", "relation")],
        {
          submitDefaults: { project: "p-1" },
        },
      ),
    ).toEqual({ project: "p-1" });
  });
});

describe("isClearedFieldValue", () => {
  it("reads nothing, a blank text and an all-blank object as cleared", () => {
    expect(isClearedFieldValue(undefined)).toBe(true);
    expect(isClearedFieldValue(null)).toBe(true);
    expect(isClearedFieldValue("")).toBe(true);
    expect(isClearedFieldValue("  ")).toBe(true);
    expect(isClearedFieldValue("<p></p>", "rich_text")).toBe(true);
    expect(isClearedFieldValue(Number.NaN)).toBe(true);
    expect(isClearedFieldValue({ en: "", fr: "" })).toBe(true);
  });

  it("reads a value, zero, false and a list as values", () => {
    expect(isClearedFieldValue("a")).toBe(false);
    expect(isClearedFieldValue(0)).toBe(false);
    expect(isClearedFieldValue(false)).toBe(false);
    expect(isClearedFieldValue([])).toBe(false);
    expect(isClearedFieldValue({ en: "", fr: "Titre" })).toBe(false);
    expect(isClearedFieldValue(new Blob(["pdf"]))).toBe(false);
  });
});

describe("localizedSubmitValue", () => {
  it("empties each blank language, keeping the filled ones", () => {
    expect(
      localizedSubmitValue({ en: "<p></p>", fr: "<p>Notes</p>" }, "rich_text"),
    ).toEqual({ en: "", fr: "<p>Notes</p>" });
    expect(localizedSubmitValue({ en: "  ", fr: "Titre" })).toEqual({
      en: "",
      fr: "Titre",
    });
  });
});

describe("clearedFieldValue", () => {
  it("is an empty list for a list and null for anything else", () => {
    expect(clearedFieldValue(["a"])).toEqual([]);
    expect(clearedFieldValue("a")).toBeNull();
    expect(clearedFieldValue({ start: "a", end: "b" })).toBeNull();
    expect(clearedFieldValue(3)).toBeNull();
  });
});
