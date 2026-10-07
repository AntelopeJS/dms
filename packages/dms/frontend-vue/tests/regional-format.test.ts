import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useRegionalFormat } from "../layers/dms-core/app/composables/user/useRegionalFormat";
import { setRegionalPreferencesSource } from "../layers/dms-core/app/utils/regional";

// 23:30 UTC on 30 Sep: already 1 Oct in Brussels.
const LATE_EVENING_UTC = new Date(Date.UTC(2026, 8, 30, 23, 30));
const DAY_MONTH_YEAR: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
};

const locale = ref("fr-FR");

beforeEach(() => {
  locale.value = "fr-FR";
  vi.stubGlobal("useI18n", () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      `${key}:${JSON.stringify(params ?? {})}`,
    locale,
  }));
  setRegionalPreferencesSource(() => ({ timeZone: "Europe/Brussels" }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  setRegionalPreferencesSource(() => ({}));
});

describe("useRegionalFormat", () => {
  it("writes dates in the user's language and time zone", () => {
    const { formatDate } = useRegionalFormat();
    expect(formatDate(LATE_EVENING_UTC, DAY_MONTH_YEAR)).toBe("1 octobre 2026");
  });

  it("follows a language switch", () => {
    const { formatDate } = useRegionalFormat();
    locale.value = "en-GB";
    expect(formatDate(LATE_EVENING_UTC, DAY_MONTH_YEAR)).toBe("1 October 2026");
  });

  it("applies the user's clock to its own formats", () => {
    setRegionalPreferencesSource(() => ({
      timeZone: "Europe/Brussels",
      timeFormat: "h12",
    }));
    const { dateTimeFormat } = useRegionalFormat();
    locale.value = "en-GB";
    expect(
      dateTimeFormat({ hour: "numeric", minute: "2-digit" }).format(
        LATE_EVENING_UTC,
      ),
    ).toBe("1:30 am");
  });

  it("writes numbers in the user's language", () => {
    const { formatNumber, formatPrice } = useRegionalFormat();
    expect(formatNumber(1234.5)).toBe("1 234,5");
    expect(formatPrice(12)).toBe("12,00 €");
  });

  it("translates relative dates with the application's messages", () => {
    const { formatRelativeTime } = useRegionalFormat();
    expect(formatRelativeTime(Date.now())).toBe("common.time.just_now:{}");
  });
});
