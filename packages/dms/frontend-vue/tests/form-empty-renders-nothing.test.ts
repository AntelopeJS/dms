// @vitest-environment jsdom
import { expect, it } from "vitest";
import { host, mountForm } from "./helpers/form-runtime";

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

async function mountSettled(props: Parameters<typeof mountForm>[0]) {
  await mountForm(props, undefined, undefined, () => true);
  await settled();
}

it("draws nothing for a form with no fields, no record to load and nothing to say", async () => {
  await mountSettled({ fields: [], submitUrl: undefined });
  expect(host.querySelector("form")).toBeNull();
  expect(host.textContent).toBe("");
  expect(host.querySelector("div")).toBeNull();
});

it("keeps a form that has a field", async () => {
  await mountSettled({});
  expect(host.querySelector("form")).not.toBeNull();
});

it("keeps a titled form without fields", async () => {
  await mountSettled({ fields: [], submitUrl: undefined, title: "Notes" });
  expect(host.querySelector("form")).not.toBeNull();
  expect(host.textContent).toContain("Notes");
});

it("keeps the submit of an action form without fields", async () => {
  await mountSettled({ fields: [], kind: "action", submitUrl: "/api/run" });
  expect(host.querySelector("form")).not.toBeNull();
});
