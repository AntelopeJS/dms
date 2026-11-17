import assert from "node:assert/strict";
import { test } from "node:test";
import { getHeapStatistics } from "node:v8";
import { HTTPResult } from "@antelopejs/interface-api";
import {
  type DataType,
  getDataTypeId,
} from "@antelopejs/interface-dms/base/data-types";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  type FormBuilder,
  type FormField,
  formSchema,
  isFieldGroup,
} from "@antelopejs/interface-dms/base/form";
import type { JsonValue } from "@antelopejs/interface-dms/base/types";
import {
  type DemoBody,
  type DemoRecord,
  parseFormBody,
} from "./demo-record-api";
import { PageFormAddress } from "./address/page";
import { PageFormAdvanced } from "./advanced/page";
import { PageFormConfirm } from "./confirm/page";
import { PageFormCustomInput } from "./custom-input/page";
import { PageFormGrouped } from "./grouped/page";
import { PageFormLocalized } from "./localized/page";
import { PageFormSaving } from "./saving/page";
import { PageFormSectionsJump } from "./sections-jump/page";
import { PageFormSimple } from "./simple/page";
import { PageFormWatchActions } from "./watch-actions/page";

/** Every form a demo route checks with `parseFormBody`. */
const DEMO_FORMS = {
  "PageFormSimple.form": PageFormSimple.form,
  "PageFormWatchActions.form": PageFormWatchActions.form,
  "PageFormSaving.footer": PageFormSaving.footer,
  "PageFormConfirm.workspace": PageFormConfirm.workspace,
  "PageFormCustomInput.form": PageFormCustomInput.form,
  "PageFormAddress.addressForm": PageFormAddress.addressForm,
  "PageFormGrouped.form": PageFormGrouped.form,
  "PageFormLocalized.form": PageFormLocalized.form,
  "PageFormSectionsJump.form": PageFormSectionsJump.form,
  "PageFormAdvanced.productForm": PageFormAdvanced.productForm,
  "PageFormAdvanced.userPreferences": PageFormAdvanced.userPreferences,
} satisfies Record<string, FormBuilder>;

const DAY = "2025-03-14";
const NEXT_DAY = "2025-03-20";
const INSTANT = "2025-03-14T09:30:00.000Z";
const DEFAULT_LOCALE = "en";

/** The values a client sends for a field of this type, as JSON: one per way a client writes it. */
function clientValues(type: DataType): JsonValue[] {
  if (type instanceof DefaultDataTypes.DateType) {
    if (type.options.range) {
      return [{ start: DAY, end: NEXT_DAY }, [DAY, NEXT_DAY]];
    }
    if (type.options.multiple) return [[DAY, NEXT_DAY]];
    return [DAY, INSTANT];
  }
  if (type instanceof DefaultDataTypes.SelectType) {
    const values = type.options.items.map((item) => String(item.value));
    return type.options.multiple
      ? [values.slice(0, 1), values]
      : values.slice(0, 1);
  }
  if (type instanceof DefaultDataTypes.NumberType) {
    return [type.options.min ?? type.options.max ?? 0];
  }
  if (type instanceof DefaultDataTypes.StringType) {
    return ["x".repeat(Math.max(type.options.minLength ?? 1, 1))];
  }
  if (type instanceof DefaultDataTypes.BooleanType) return [true, false];
  if (type instanceof DefaultDataTypes.EmailType) return ["ada@acme.io"];
  if (type instanceof DefaultDataTypes.ColorType) return ["#3b82f6"];
  if (type instanceof DefaultDataTypes.PhoneType) return ["+33612345678"];
  if (type instanceof DefaultDataTypes.RichTextType) return ["<p>Hello</p>"];
  if (type instanceof DefaultDataTypes.AddressType) {
    return [
      {
        streetName: "Rue de Rivoli",
        houseNumber: "1",
        postalCode: "75001",
        city: "Paris",
        countryCode: "FR",
      },
    ];
  }
  throw new Error(
    `the ${getDataTypeId(type)} type has no client value in this test: add what a client sends for it`,
  );
}

function fieldValues(field: FormField): JsonValue[] {
  const values = clientValues(field.type);
  if (!field.localized) return values;
  const locale = field.fallbackLocale ?? DEFAULT_LOCALE;
  return values.map((value) => ({ [locale]: value }));
}

function formFields(form: FormBuilder): FormField[] {
  return form.fields.flatMap((entry) =>
    isFieldGroup(entry) ? entry.fields : [entry],
  );
}

interface ClientBody {
  label: string;
  body: DemoBody;
}

/** What a client sends for a form: every field at once, then each field alone (a form saves what changed). */
function clientBodies(form: FormBuilder): ClientBody[] {
  const fields = formFields(form);
  const rounds = Math.max(...fields.map((field) => fieldValues(field).length));
  const bodies: ClientBody[] = [];
  for (let round = 0; round < rounds; round++) {
    const body: DemoBody = {};
    for (const field of fields) {
      const values = fieldValues(field);
      body[field.id] = values[Math.min(round, values.length - 1)];
    }
    bodies.push({ label: `all fields, round ${round + 1}`, body });
  }
  for (const field of fields) {
    for (const value of fieldValues(field)) {
      bodies.push({
        label: `${field.id} alone: ${JSON.stringify(value)}`,
        body: { [field.id]: value },
      });
    }
  }
  return bodies;
}

const ONE_MIB = 1024 * 1024;
const MAX_MILLISECONDS = 500;
const MAX_HEAP_GROWTH = 64 * ONE_MIB;
const WIDE_LAYOUTS = ["many-keys", "wide-leaf"] as const;

/** `depth` levels of list around `leaf`. */
function nested(depth: number, leaf: JsonValue): JsonValue {
  let value = leaf;
  for (let level = 0; level < depth; level++) value = [value];
  return value;
}

/**
 * A body of at least 1 MiB whose values nest `depth` deep: one chain per key
 * (`many-keys`), or one chain whose innermost list is the 1 MiB (`wide-leaf`).
 * When `known`, a chain is also sent under a field of the form.
 */
function wideBody(
  layout: (typeof WIDE_LAYOUTS)[number],
  depth: number,
  known: boolean,
): DemoBody {
  if (layout === "wide-leaf") {
    const leaf = Array.from({ length: ONE_MIB / 2 }, () => 1);
    return { [known ? "textField" : "unknown"]: nested(depth, leaf) };
  }
  const chainBytes = JSON.stringify(nested(depth, [])).length;
  const body: DemoBody = {};
  for (let index = 0; index < ONE_MIB / chainBytes; index++) {
    body[`unknown${index}`] = nested(depth, []);
  }
  if (known) body.textField = nested(depth, []);
  return body;
}

interface Answer {
  saved?: DemoRecord;
  refusal?: HTTPResult;
}

async function answerOf(body: DemoBody): Promise<Answer> {
  try {
    return { saved: await parseFormBody(PageFormSimple.form, body) };
  } catch (error) {
    if (error instanceof HTTPResult) return { refusal: error };
    throw error;
  }
}

async function assertAnsweredFast(
  layout: (typeof WIDE_LAYOUTS)[number],
  depth: number,
  known: boolean,
): Promise<void> {
  const body = wideBody(layout, depth, known);
  assert.ok(JSON.stringify(body).length >= ONE_MIB, "the body is 1 MiB");
  const heapBefore = getHeapStatistics().used_heap_size;
  const started = performance.now();
  const answer = await answerOf(body);
  const milliseconds = performance.now() - started;
  const heapGrowth = getHeapStatistics().used_heap_size - heapBefore;
  assert.ok(milliseconds < MAX_MILLISECONDS, `${milliseconds} ms`);
  assert.ok(heapGrowth < MAX_HEAP_GROWTH, `${heapGrowth} bytes of heap`);
  if (known) {
    assert.equal(answer.refusal?.getStatus(), 400);
  } else {
    assert.deepEqual(answer.saved, {});
  }
}

/** Resolves when every case has run. */
export const settled = Promise.all([
  ...Object.entries(DEMO_FORMS).map(([name, form]) =>
    test(`${name}: every value a client sends is saved as the form parsed it`, async () => {
      for (const { label, body } of clientBodies(form)) {
        const parsed = formSchema(form).partial().safeParse(body);
        assert.ok(parsed.success, `${label}: the form refuses its own value`);
        assert.deepEqual(await parseFormBody(form, body), parsed.data, label);
      }
    }),
  ),
  test("the Simple form saves the dates a date picker sends", async () => {
    const saved = await parseFormBody(PageFormSimple.form, {
      calendarField: DAY,
      calendarRangeField: { start: DAY, end: NEXT_DAY },
      calendarMultipleField: [DAY, NEXT_DAY],
    });
    assert.deepEqual(saved, {
      calendarField: new Date(DAY),
      calendarRangeField: { start: new Date(DAY), end: new Date(NEXT_DAY) },
      calendarMultipleField: [new Date(DAY), new Date(NEXT_DAY)],
    });
    const rangeAsPair = await parseFormBody(PageFormSimple.form, {
      calendarRangeField: [DAY, NEXT_DAY],
    });
    assert.deepEqual(rangeAsPair, {
      calendarRangeField: { start: new Date(DAY), end: new Date(NEXT_DAY) },
    });
  }),
  test("the Watch actions form saves the day a member joined", async () => {
    const saved = await parseFormBody(PageFormWatchActions.form, {
      joinedOn: DAY,
    });
    assert.deepEqual(saved, { joinedOn: new Date(DAY) });
  }),
  test("a value the form refuses is answered as a 400 that names the field", async () => {
    await assert.rejects(
      parseFormBody(PageFormSimple.form, { calendarField: "yesterday" }),
      (error) =>
        error instanceof HTTPResult &&
        error.getStatus() === 400 &&
        String(error.getBody()).includes("calendarField"),
    );
  }),
  ...[63, 64].flatMap((depth) =>
    WIDE_LAYOUTS.map((layout) =>
      test(`a 1 MiB body of ${layout} values nested ${depth} deep is answered fast`, async () => {
        await assertAnsweredFast(layout, depth, false);
        await assertAnsweredFast(layout, depth, true);
      }),
    ),
  ),
]);
