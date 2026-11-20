import assert from "node:assert/strict";
import test from "node:test";
import { DefaultLayout } from "../dist/base/layouts.js";

/**
 * The target a layout serves for one header button whose `api` target
 * redirects to `redirect`.
 *
 * @param {string} redirect
 */
function servedTarget(redirect) {
  /** @type {import("../dist/component-options/internal/page-layout.js").DefaultLayoutSerializedOptions} */
  const options = DefaultLayout({
    headerActions: [
      {
        label: "Create",
        target: {
          type: "api",
          url: "/api/documents/{{params.id}}/copy",
          method: "POST",
          redirect,
          successMessage: "Created",
        },
      },
    ],
  }).options;
  return options.headerActions?.[0]?.target;
}

await test("an api target serves its dashboard redirect as declared", () => {
  const target = servedTarget("/documents/{{response.document._id}}");
  assert.equal(
    target?.type === "api" ? target.redirect : undefined,
    "/documents/{{response.document._id}}",
  );
});

for (const redirect of [
  "https://elsewhere.example/documents",
  "javascript:alert(1)",
  "//elsewhere.example/documents",
  "/\\elsewhere.example/documents",
  "documents/{{response._id}}",
  "{{response.url}}",
]) {
  await test(`an api target refuses the redirect ${redirect}`, () => {
    assert.throws(
      () => servedTarget(redirect),
      /redirects to a path of the dashboard/,
    );
  });
}
