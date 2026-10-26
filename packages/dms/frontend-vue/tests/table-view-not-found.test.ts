/**
 * A table view whose list answers 404 names a resource that no longer exists
 * (the workspace its rows belong to was deleted): it shows the not-found
 * state blocks show, with what the 404 said, never its error panel and its
 * retry, nor an empty table.
 */
import { describe, expect, it } from "vitest";
import { readFetchNotFound } from "../layers/dms-ui/app/build/utils/fetchNotFound";

describe("a table view whose list answers 404", () => {
  it("takes a 404 for not found, and any other failure for an error", () => {
    expect(
      readFetchNotFound({
        statusCode: 404,
        data: { message: "$lang.workspace.unknown_hint" },
      }),
    ).toEqual({
      message: "$lang.workspace.unknown_hint",
      emptyState: undefined,
    });
    expect(readFetchNotFound({ statusCode: 500 })).toBeNull();
    expect(readFetchNotFound({ statusCode: 403 })).toBeNull();
  });
});
