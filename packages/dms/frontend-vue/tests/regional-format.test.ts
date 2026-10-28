import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import { ref } from "vue";
import type { I18nTranslate } from "../layers/dms-core/app/composables/translation/useTranslation";
import { useRegionalFormat } from "../layers/dms-core/app/composables/user/useRegionalFormat";
import {
  regionalFormatLocale,
  setRegionalPreferencesSource,
} from "../layers/dms-core/app/utils/regional";

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
    t: (key: string, params?: Parameters<I18nTranslate>[1]) =>
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
    expect(formatNumber(1234.5)).toBe("1\u202F234,5");
    expect(formatPrice(12)).toBe("12,00 €");
  });

  it("translates relative dates with the application's messages", () => {
    const { formatRelativeTime } = useRegionalFormat();
    expect(formatRelativeTime(Date.now())).toBe("common.time.just_now:{}");
  });

  it("types a formatted number as a string", () => {
    const { formatNumber, formatPercentage, formatPrice } = useRegionalFormat();
    const written: string[] = [
      formatNumber(1234.5),
      formatPercentage(0.25),
      formatPrice(12),
    ];
    expect(written).toEqual([
      "1\u202F234,5",
      new Intl.NumberFormat("fr-FR", { style: "percent" }).format(0.25),
      new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
      }).format(12),
    ]);
    expectTypeOf(formatNumber(1)).toEqualTypeOf<string>();
    expectTypeOf<Parameters<typeof formatNumber>[0]>().toEqualTypeOf<unknown>();
    expectTypeOf<ReturnType<typeof formatNumber>>().toEqualTypeOf<unknown>();
    expect(formatNumber("n/a")).toBe("n/a");
  });

  it("names the locale of the DMS texts for the interface language", () => {
    locale.value = "en";
    const { formatLocale } = useRegionalFormat();
    expect(formatLocale.value).toBe("en-GB");
    locale.value = "fr";
    expect(formatLocale.value).toBe("fr-FR");
  });

  it("writes in the locale of the DMS texts when asked", () => {
    locale.value = "en";
    const interfaceFormat = useRegionalFormat();
    const textFormat = useRegionalFormat({ locale: "format" });
    const clock: Intl.DateTimeFormatOptions = {
      hour: "numeric",
      minute: "2-digit",
    };
    expect(interfaceFormat.dateTimeFormat(clock).format(LATE_EVENING_UTC)).toBe(
      "1:30 AM",
    );
    expect(textFormat.dateTimeFormat(clock).format(LATE_EVENING_UTC)).toBe(
      "1:30",
    );
    expect(textFormat.formatDate(LATE_EVENING_UTC, DAY_MONTH_YEAR)).toBe(
      "1 October 2026",
    );
  });
});

describe("regionalFormatLocale", () => {
  it("reads a bare DMS language as the region its texts are written for", () => {
    expect(regionalFormatLocale("en")).toBe("en-GB");
    expect(regionalFormatLocale("fr")).toBe("fr-FR");
    expect(regionalFormatLocale("en-US")).toBe("en-US");
    expect(regionalFormatLocale("de")).toBe("de");
  });
});
