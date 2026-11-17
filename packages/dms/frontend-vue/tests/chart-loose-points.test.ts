import { describe, expect, it } from "vitest";
import { z } from "zod";
import { isObject, isString } from "../layers/dms-core/app/utils/type-check";
import { localizeSeries } from "../layers/dms-ui/app/composables/chart/localizeSeries";
import type { ChartSeries } from "../layers/dms-ui/app/composables/chart/types";

const answeredSeries = z.custom<ChartSeries>(
  (value) =>
    isObject(value) && isString(value.name) && Array.isArray(value.data),
);

const translate = (text: string) => `translated ${text}`;

describe("DMS chart series a route answers loosely", () => {
  it("keeps a point that is not an object as the route sent it", () => {
    const answered = answeredSeries.parse(
      JSON.parse('{ "name": "Revenue", "data": ["12.5", 3, true, null] }'),
    );

    expect(localizeSeries(answered, translate).data).toEqual([
      "12.5",
      3,
      true,
      null,
    ]);
  });
});
