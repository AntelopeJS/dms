import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import {
  browserTimeZone,
  setReaderTimeZoneSource,
} from "../layers/dms-core/app/utils/regional";

// A zone the test process does not run in, as a browser elsewhere sends it.
const READER_ZONE =
  browserTimeZone() === "Pacific/Auckland"
    ? "America/New_York"
    : "Pacific/Auckland";
const user = ref<Record<string, unknown>>({});

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useDmsUserSession", () => ({ user }));
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB") }));
  user.value = {};
});

afterEach(() => {
  setReaderTimeZoneSource(() => null);
  vi.unstubAllGlobals();
});

async function preferences() {
  const { useUserRegionalPreferences } = await import(
    "../layers/dms-core/app/composables/user/useUserRegionalPreferences"
  );
  return useUserRegionalPreferences();
}

it("suggests, on a server render, the zone of the browser the page is for", async () => {
  setReaderTimeZoneSource(() => READER_ZONE);
  const { detectedTimeZone, timeZone } = await preferences();
  expect(detectedTimeZone).toBe(READER_ZONE);
  expect(timeZone.value).toBe(READER_ZONE);
});

it("suggests the zone the code runs in while no browser named one", async () => {
  const { detectedTimeZone } = await preferences();
  expect(detectedTimeZone).toBe(browserTimeZone());
});

it("keeps the zone the user chose over the detected one", async () => {
  setReaderTimeZoneSource(() => READER_ZONE);
  user.value = { timeZone: "Europe/Lisbon" };
  const { timeZone } = await preferences();
  expect(timeZone.value).toBe("Europe/Lisbon");
});
