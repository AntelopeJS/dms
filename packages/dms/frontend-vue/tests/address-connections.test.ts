// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createApp, h, nextTick, Suspense, type App } from "vue";
import Input from "@nuxt/ui/components/Input.vue";
import SelectMenu from "@nuxt/ui/components/SelectMenu.vue";
import { host, i18n, t } from "./helpers/form-runtime";

let app: App | undefined;
afterEach(() => app?.unmount());

async function mountAddress() {
  vi.stubGlobal("useI18n", () => ({
    t,
    tm: () => ({}),
    locale: i18n.global.locale,
  }));
  const fetch = vi.fn<() => Promise<unknown>>();
  vi.stubGlobal("$fetch", fetch);
  const { default: Address } = await import(
    "../layers/dms-ui/app/components/form/components/InputAddress.vue"
  );
  app = createApp({
    render: () =>
      h(Suspense, null, {
        default: () =>
          h(Address, { id: "street", autocomplete: { enabled: true } }),
      }),
  });
  app.component("UInput", Input);
  app.component("USelectMenu", SelectMenu);
  app.mount(host);
  await vi.waitFor(() => expect(host.querySelector("#street")).not.toBeNull());
  return fetch;
}

const places = {
  features: [
    {
      properties: { street: "Station Road", city: "London", countrycode: "gb" },
    },
  ],
};

function typeStreet(value: string) {
  const input = host.querySelector<HTMLInputElement>("#street")!;
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return input;
}

it("rejects street suggestions reopened by an answer arriving after focus left", async () => {
  const fetch = await mountAddress();
  let answer: (value: unknown) => void = () => {};
  fetch.mockImplementation(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );
  const street = typeStreet("Station");
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  const house = host.querySelectorAll("input")[1]!;
  house.focus();
  await new Promise((resolve) => setTimeout(resolve, 170));
  answer(places);
  await nextTick();
  await nextTick();
  expect(document.activeElement).toBe(house);
  expect(host.textContent).not.toContain("Station Road");
  street.focus();
  await nextTick();
  expect(host.textContent).toContain("Station Road");
});

it("rejects Escape wired to a different key or allowed to close the enclosing form", async () => {
  const fetch = await mountAddress();
  fetch.mockResolvedValue(places);
  const street = typeStreet("Station");
  await vi.waitFor(() => expect(host.textContent).toContain("Station Road"));
  const escaped = vi.fn();
  host.addEventListener("keydown", escaped);
  street.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await nextTick();
  expect(host.textContent).not.toContain("Station Road");
  expect(escaped).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(street);
  host.removeEventListener("keydown", escaped);
});
