import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { capturedMail } from "./mail.mjs";

const SUMMARY = {
  from: "no-reply@example.com",
  to: ["a@example.com"],
  subject: "Welcome",
  links: ["https://example.com/verify"],
  text: "Hello",
  receivedAt: "2026-11-02T00:00:00.000Z",
};

/**
 * @param {import("node:test").TestContext} t The test
 * @param {unknown} summary What the sink stored for its one message
 * @returns {string} The sink's folder
 */
function sink(t, summary) {
  const folder = mkdtempSync(join(tmpdir(), "dms-control-mail-test-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  writeFileSync(join(folder, "001.json"), JSON.stringify(summary));
  return folder;
}

await test("a captured message reads back with the path of its raw file", (t) => {
  const folder = sink(t, SUMMARY);
  assert.deepEqual(capturedMail(folder), [
    { file: join(folder, "001.eml"), ...SUMMARY },
  ]);
});

await test("a stored summary whose recipients are no list is refused", (t) => {
  const folder = sink(t, { ...SUMMARY, to: "a@example.com" });
  assert.throws(
    () => capturedMail(folder),
    /001\.json is malformed: expected a captured message/,
  );
});

await test("a folder that does not exist holds no mail", () => {
  assert.deepEqual(
    capturedMail(join(tmpdir(), "dms-control-no-such-sink")),
    [],
  );
});

await test("a stored summary without its links is refused", (t) => {
  const { links: _links, ...withoutLinks } = SUMMARY;
  const folder = sink(t, withoutLinks);
  assert.throws(() => capturedMail(folder), /001\.json is malformed/);
});
