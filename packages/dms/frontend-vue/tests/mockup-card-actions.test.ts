/** @vitest-environment jsdom */
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

/**
 * Fails an implementation whose menu lacks an action, labels the menu button
 * with something other than its card, or opens another mockup's viewer.
 */
it("gives each card a labelled menu that opens its viewer, renames, copies and deletes it", async () => {
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

/**
 * Fails an implementation that deletes without asking, deletes after a
 * refusal, deletes another mockup than the card's, or leaves the card on
 * screen after the delete.
 */
it("deletes a mockup only once the user confirmed, then reads the list again", async () => {
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

/**
 * Fails an implementation that copies another mockup, names the copy itself
 * (the server picks a free name), or neither tells the user nor refreshes.
 */
it("duplicates a mockup and says which name the copy got", async () => {
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

/**
 * Fails an implementation that renames over the wrong mockup, sends a name
 * the API refuses, sends fields the user did not change, or lets an
 * unchanged form submit.
 */
it("renames through a form that sends only what changed and refuses a name the API would", async () => {
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
  expect(root.querySelector("[data-modal]")?.textContent).toContain(
    "reserved",
  );
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

/**
 * Fails an implementation that closes the form, or reads the list again, when
 * the API refused the rename.
 */
it("keeps the rename form open and reports the failure when the API refuses", async () => {
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

/**
 * Fails an implementation whose first card is not the new mockup one, that
 * dispatches nothing or another source, or that shows the copy modal even
 * though an assistant claimed the request.
 */
it("hands the assistant a starter request from the New mockup card, and shows nothing when it claims it", async () => {
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

/**
 * Fails an implementation that drops the request when no assistant listens,
 * instead of showing it to copy in the AI tool the developer uses.
 */
it("shows the starter to copy when no assistant claims the New mockup request", async () => {
  const root = await mountCards([built]);

  await click(root.querySelector("[data-dms-mockup-new]") ?? root);

  expect(text(root, "[data-dms-mockup-prompt]")).toBe("Draft a mockup of …");
});

/**
 * Fails an implementation that leaves an empty project with the explanation
 * alone, so the one thing to do next is not on screen.
 */
it("offers New mockup under the empty state too", async () => {
  const root = await mountCards([]);

  expect(root.textContent).toContain(en.dms.table.empty_title);
  const button = root.querySelector("[data-dms-mockup-new]");
  expect(button?.textContent?.trim()).toBe("New mockup");

  await click(button ?? root);
  expect(text(root, "[data-dms-mockup-prompt]")).toBe("Draft a mockup of …");
});
