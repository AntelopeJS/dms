import { describe, expect, it } from "vitest";
import { withRecordTokens } from "../layers/dms-ui/app/build/composables/actions/recordTokens";

const SOLE = { tableId: "tickets", isSoleTableView: true };

describe("withRecordTokens", () => {
  it("names the row in the table's record token, deep in the options", () => {
    const options = {
      rowId: "{{query.record}}",
      fetchUrl: "/api/tickets/get?id={{ query.record }}",
      children: [{ options: { fetchUrl: "/api/x/{{query.record}}/facts" } }],
      count: 3,
    };
    expect(withRecordTokens(options, SOLE, "default:t 1")).toEqual({
      rowId: "default:t 1",
      fetchUrl: "/api/tickets/get?id=default:t%201",
      children: [{ options: { fetchUrl: "/api/x/default:t%201/facts" } }],
      count: 3,
    });
  });

  it("reads the prefixed key of a table sharing its page", () => {
    const options = {
      own: "{{query.tickets.record}}",
      other: "{{query.record}}",
    };
    expect(withRecordTokens(options, { tableId: "tickets" }, "t1")).toEqual({
      own: "t1",
      other: "{{query.record}}",
    });
  });

  it("leaves the options alone without a row", () => {
    const options = { rowId: "{{query.record}}" };
    expect(withRecordTokens(options, SOLE, undefined)).toBe(options);
    expect(withRecordTokens(undefined, SOLE, "t1")).toBeUndefined();
  });

  it("keeps values that are not plain data as they are", () => {
    class DataType {
      id = "{{query.record}}";
    }
    const type = new DataType();
    expect(withRecordTokens({ type }, SOLE, "t1").type).toBe(type);
  });
});
