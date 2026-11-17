import assert from "node:assert/strict";
import { test } from "node:test";
import { answerDocsFixture } from "../frontend-vue/server/docs-fixtures/answer.ts";

/**
 * @param {string} query
 * @returns {unknown}
 */
const postponed = (query) =>
  answerDocsFixture({
    method: "POST",
    path: "projects/postpone",
    query: new URLSearchParams(query),
  }).body;

await test("a bulk write counts every row the selection covers", () => {
  assert.deepEqual(postponed("allMatching=true"), { count: 32 });
  assert.deepEqual(postponed("allMatching=true&search=in"), { count: 19 });
  assert.deepEqual(postponed("ids=a&ids=b&ids=c&ids=d"), { count: 4 });
  assert.deepEqual(postponed("id=a"), { count: 1 });
});
