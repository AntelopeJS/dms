import { describe, expect, it } from "vitest";
import { orderFormEntries } from "../layers/dms-ui/app/entries/composables/form/formEntryOrder";
import type { FormFieldOrGroup } from "../layers/dms-ui/app/composables/form/types/field";

const field = (id: string) => ({
  id,
  component: { componentName: "dms-input-text" },
});

const group = (id: string, order?: number) => ({
  id,
  order,
  fields: [field(`${id}Member`)],
});

const ids = (entries: FormFieldOrGroup[]) => entries.map((entry) => entry.id);

describe("orderFormEntries", () => {
  it("moves the groups giving an order into their places, lowest first", () => {
    const entries: FormFieldOrGroup[] = [
      field("username"),
      group("contact"),
      field("bio"),
      group("social", 2),
      group("address", 1),
    ];
    expect(ids(orderFormEntries(entries))).toEqual([
      "username",
      "contact",
      "bio",
      "address",
      "social",
    ]);
  });

  it("keeps the declaration order of equal orders and of no order at all", () => {
    const entries: FormFieldOrGroup[] = [
      group("first", 1),
      field("name"),
      group("second", 1),
      group("loose"),
    ];
    expect(ids(orderFormEntries(entries))).toEqual(ids(entries));
  });
});
