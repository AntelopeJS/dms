/**
 * A table view whose list answers 404 names a resource that no longer exists
 * (the workspace its rows belong to was deleted): it shows the not-found
 * state blocks show, with what the 404 said, never its error panel and its
 * retry, nor an empty table.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readFetchNotFound } from "../layers/dms-ui/app/build/utils/fetchNotFound";

const tableView = readFileSync(
  resolve(
    __dirname,
    "../layers/dms-ui/app/components/table-view/TableView.vue",
  ),
  "utf8",
);

describe("a table view whose list answers 404", () => {
  it("reads the not-found answer of its settled list only", () => {
    expect(tableView).toMatch(
      /const listNotFound = computed\(\(\) => readFetchNotFound\(settledError\.value\)\);/,
    );
  });

  it("gives way to the blocks' not-found state", () => {
    const template = tableView.slice(tableView.indexOf("<template>"));
    expect(template).toMatch(
      /^<template>\s*<DmsBlockStatus\s+v-if="listNotFound"\s+state="not-found"\s+:not-found="listNotFound"\s*\/>\s*<UTable\s+v-else/,
    );
  });

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
