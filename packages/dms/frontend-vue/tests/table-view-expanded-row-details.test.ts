import { describe, expect, it, vi } from "vitest";
import { useExpandedRowDetails } from "../layers/dms-ui/app/build/composables/table-view/useExpandedRowDetails";
import { buildExpandedRowProps } from "../layers/dms-ui/app/build/composables/table-view/utils/expandedRowProps";
import type { TableViewDisplayActions } from "../layers/dms-ui/app/composables/table-view/types";

interface Order {
  _id: string;
  number: string;
  lines?: string[];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("lazyLoad expanded rows", () => {
  it("reads an opened row once, until the listed rows reload", async () => {
    const getRow = vi.fn(async (id: string) => ({ _id: id, number: "A-1" }));
    const details = useExpandedRowDetails<Order>(getRow);

    details.ensure(["a1"]);
    expect(details.entryOf("a1")?.state).toBe("loading");
    await vi.waitFor(() => expect(details.entryOf("a1")?.state).toBe("ready"));
    details.ensure(["a1"]);
    expect(getRow).toHaveBeenCalledOnce();

    details.reset();
    expect(details.entryOf("a1")).toBeUndefined();
    details.ensure(["a1"]);
    expect(getRow).toHaveBeenCalledTimes(2);
  });

  it("says a failed read failed, and reads it again on retry", async () => {
    const getRow = vi
      .fn<(id: string) => Promise<Order | undefined>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ _id: "a1", number: "A-1" });
    const details = useExpandedRowDetails<Order>(getRow);

    details.ensure(["a1"]);
    await vi.waitFor(() => expect(details.entryOf("a1")?.state).toBe("error"));
    await details.load("a1");
    expect(details.entryOf("a1")).toEqual({
      state: "ready",
      row: { _id: "a1", number: "A-1" },
    });
  });

  it("drops an answer that lands after the rows reloaded", async () => {
    const answer = deferred<Order | undefined>();
    const details = useExpandedRowDetails<Order>(() => answer.promise);

    const loading = details.load("a1");
    details.reset();
    answer.resolve({ _id: "a1", number: "stale" });
    await loading;
    expect(details.entryOf("a1")).toBeUndefined();
  });
});

describe("expanded row props", () => {
  it("hands a band its row, actions, open and the table's refresh", () => {
    const open = vi.fn();
    const refresh = vi.fn();
    const actions = { open } as unknown as TableViewDisplayActions<Order>;
    const row = { _id: "a1", number: "A-1" };
    const props = buildExpandedRowProps(row, {
      columns: [],
      labelKey: "number",
      rowIdKey: "_id",
      actions,
      refresh,
    });

    expect(props).toMatchObject({ row, rowId: "a1", labelKey: "number" });
    expect(props.actions).toBe(actions);
    props.open();
    expect(open).toHaveBeenCalledWith(row);
    props.refresh();
    expect(refresh).toHaveBeenCalledOnce();
  });
});
