import { describe, expect, it } from "vitest";
import { localizeSeries } from "../layers/dms-ui/app/composables/chart/localizeSeries";

const translate = (text: string) => `translated ${text}`;

describe("DMS chart series a route answers loosely", () => {
  it("keeps a point that is not an object as the route sent it", () => {
    const answered = JSON.parse(
      '{ "name": "Revenue", "data": ["12.5", 3, true, null] }',
    );

    expect(localizeSeries(answered, translate).data).toEqual([
      "12.5",
      3,
      true,
      null,
    ]);
  });
});
