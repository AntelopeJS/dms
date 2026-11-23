/**
 * @vitest-environment jsdom
 * @packageDocumentation
 */
import { nextTick } from "vue";
import { expect, it, vi } from "vitest";
import {
  addToast,
  authFetch,
  built,
  card,
  click,
  confirm,
  draft,
  en,
  menuItem,
  mountCards,
  navigateTo,
  presentError,
  refresh,
  text,
} from "./helpers/mockup-cards-runtime";

it("gives each card a labelled menu that opens its viewer, renames, copies and deletes it (fails on a menu lacking an action, a button not labelled with its card, or another mockup's viewer opening)", async () => {
  const root = await mountCards([built, draft]);
  const own = card(root, "bike-rental");

  expect(
    [...own.querySelectorAll("[data-menu-item]")].map((item) =>
      item.getAttribute("data-menu-item"),
    ),
  ).toEqual(["Open", "Rename", "Duplicate", "Delete"]);
  expect(
    own.querySelector("[data-dms-mockup-menu]")?.getAttribute("aria-label"),
  ).toBe("Actions for Bike rental");

  await click(menuItem(own, "Open"));
  expect(navigateTo).toHaveBeenCalledWith("/mockup?name=bike-rental");
});

it("deletes a mockup only once the user confirmed, then reads the list again (fails on deleting without asking or after a refusal, deleting another mockup than the card's, or leaving the card on screen)", async () => {
  const root = await mountCards([built, draft]);
  confirm.mockResolvedValueOnce(false);

  await click(menuItem(card(root, "bike-rental"), "Delete"));
  await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  expect(authFetch).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();

  authFetch.mockResolvedValue({});
  await click(menuItem(card(root, "stations-map"), "Delete"));
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

  expect(confirm.mock.calls[1]?.[0]).toMatchObject({
    title: "Delete stations-map?",
    color: "error",
    initialFocus: "cancel",
  });
  expect(authFetch).toHaveBeenCalledTimes(1);
  expect(authFetch).toHaveBeenCalledWith("/api/mockup/stations-map", {
    method: "DELETE",
  });
});

it("duplicates a mockup and says which name the copy got (fails on copying another mockup, naming the copy itself instead of the server picking a free name, or neither telling the user nor refreshing)", async () => {
  const root = await mountCards([built, draft]);
  authFetch.mockResolvedValue({ name: "bike-rental-copy" });

  await click(menuItem(card(root, "bike-rental"), "Duplicate"));
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

  expect(authFetch).toHaveBeenCalledWith("/api/mockup/bike-rental/duplicate", {
    method: "POST",
    body: {},
  });
  expect(addToast).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Copied as bike-rental-copy" }),
  );
});

it("renames through a form that sends only what changed and refuses a name the API would (fails on renaming the wrong mockup, sending a refused name or an unchanged field, or submitting an unchanged form)", async () => {
  const root = await mountCards([built, draft]);
  await click(menuItem(card(root, "bike-rental"), "Rename"));
  const save = () => root.querySelector("[data-dms-mockup-rename-save]");
  const type = async (selector: string, value: string) => {
    const input = root.querySelector(selector);
    if (!(input instanceof HTMLInputElement)) throw new Error(selector);
    input.value = value;
    input.dispatchEvent(new Event("input"));
    await nextTick();
  };

  expect(save()?.hasAttribute("disabled")).toBe(true);

  await type("[data-dms-mockup-rename-name]", "Not A Slug");
  expect(save()?.hasAttribute("disabled")).toBe(true);
  expect(root.querySelector("[data-modal]")?.textContent).toContain("reserved");
  await type("[data-dms-mockup-rename-name]", "example");
  expect(save()?.hasAttribute("disabled")).toBe(true);

  await type("[data-dms-mockup-rename-name]", "bike-hire");
  expect(save()?.hasAttribute("disabled")).toBe(false);

  authFetch.mockResolvedValue({ name: "bike-hire" });
  root
    .querySelector("[data-dms-mockup-rename-form]")
    ?.dispatchEvent(new Event("submit", { cancelable: true }));
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

  expect(authFetch).toHaveBeenCalledWith("/api/mockup/bike-rental", {
    method: "PATCH",
    body: { name: "bike-hire" },
  });
  expect(root.querySelector("[data-modal]")).toBeNull();
});

it("keeps the rename form open and reports the failure when the API refuses (fails on closing the form or reading the list again after a refused rename)", async () => {
  const root = await mountCards([built]);
  await click(menuItem(card(root, "bike-rental"), "Rename"));
  const title = root.querySelector("[data-dms-mockup-rename-title]");
  if (!(title instanceof HTMLInputElement)) throw new Error("no title input");
  title.value = "Bike hire";
  title.dispatchEvent(new Event("input"));
  authFetch.mockRejectedValue(new Error("conflict"));

  root
    .querySelector("[data-dms-mockup-rename-form]")
    ?.dispatchEvent(new Event("submit", { cancelable: true }));
  await vi.waitFor(() => expect(presentError).toHaveBeenCalled());

  expect(authFetch.mock.calls[0]?.[1]?.body).toEqual({ title: "Bike hire" });
  expect(refresh).not.toHaveBeenCalled();
  expect(root.querySelector("[data-modal]")).not.toBeNull();
});

it("hands the assistant a starter request from the New mockup card, and shows nothing when it claims it (fails on a first card that is not the New mockup one, no dispatch or one from another source, or the copy modal despite a claim)", async () => {
  const root = await mountCards([built]);
  const details: unknown[] = [];
  const claim = (event: Event) => {
    if (event instanceof CustomEvent) details.push(event.detail);
    event.preventDefault();
  };
  window.addEventListener("dms:assistant-prompt", claim);

  const first = root.querySelector("[data-dms-mockup-cards] > li");
  expect(first?.querySelector("[data-dms-mockup-new]")).not.toBeNull();
  await click(first?.querySelector("[data-dms-mockup-new]") ?? root);
  window.removeEventListener("dms:assistant-prompt", claim);

  expect(details).toEqual([
    { source: "new-mockup", prompt: "Draft a mockup of " },
  ]);
  expect(root.querySelector("[data-modal]")).toBeNull();
});

it("shows the starter to copy when no assistant claims the New mockup request (fails on dropping the request instead of showing it to copy in the AI tool the developer uses)", async () => {
  const root = await mountCards([built]);

  await click(root.querySelector("[data-dms-mockup-new]") ?? root);

  expect(text(root, "[data-dms-mockup-prompt]")).toBe("Draft a mockup of …");
});

it("offers New mockup under the empty state too (fails on an empty project left with the explanation alone, so the one next step is not on screen)", async () => {
  const root = await mountCards([]);

  expect(root.textContent).toContain(en.dms.table.empty_title);
  const button = root.querySelector("[data-dms-mockup-new]");
  expect(button?.textContent?.trim()).toBe("New mockup");

  await click(button ?? root);
  expect(text(root, "[data-dms-mockup-prompt]")).toBe("Draft a mockup of …");
});
