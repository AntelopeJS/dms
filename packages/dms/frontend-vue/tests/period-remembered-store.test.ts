import { expect, it } from "vitest";
import { rememberPeriod } from "../layers/dms-ui/app/entries/composables/period/periodQuery";

it("starts over from a store holding an entry that is not a record of texts (fails on keeping the corrupt entry)", () => {
  const store = {
    "a#page": { period: "ytd" },
    "b#page": { period: 7 },
  };

  expect(rememberPeriod(store, "c#page", { period: "all" })).toEqual({
    "c#page": { period: "all" },
  });
});

it("keeps the entries of a store whose entries are all records of texts (fails on dropping a sound store)", () => {
  const store = { "a#page": { period: "ytd" } };

  expect(rememberPeriod(store, "b#page", { period: "all" })).toEqual({
    "a#page": { period: "ytd" },
    "b#page": { period: "all" },
  });
});
