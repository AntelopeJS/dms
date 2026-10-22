import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useRegionalFormat } from "../layers/dms-core/app/composables/user/useRegionalFormat";
import {
  formatDate,
  formatDateRange,
} from "../layers/dms-core/app/utils/formatter";
import { setRegionalPreferencesSource } from "../layers/dms-core/app/utils/regional";
import { formatPeriodRange } from "../layers/dms-ui/app/build/composables/period/periodDisplay";

// What Chrome writes for these spans: plain spaces around the dash and
// before AM/PM. Node's ICU writes U+2009 and U+202F there, so a raw
// `formatRange` rendered on the server does not hydrate.
const ICU_SPACES = /[\u2009\u202f]/;
const UTC: Intl.DateTimeFormatOptions = { timeZone: "UTC" };
const DAY: Intl.DateTimeFormatOptions = {
  ...UTC,
  month: "short",
  day: "numeric",
};

const OCT_31 = new Date(Date.UTC(2026, 9, 31, 15, 4));
const NOV_30 = new Date(Date.UTC(2026, 10, 30, 9, 5));

afterEach(() => {
  setRegionalPreferencesSource(() => ({}));
});

describe("formatDateRange", () => {
  it("writes the span with the browser's plain spaces", () => {
    const text = formatDateRange(OCT_31, NOV_30, "en-US", DAY);
    expect(text).toBe("Oct 31 – Nov 30");
    expect(text).not.toMatch(ICU_SPACES);
  });

  it("writes plain spaces in a timed span on a 12-hour clock", () => {
    const end = new Date(Date.UTC(2026, 9, 31, 17, 0));
    const text = formatDateRange(OCT_31, end, "en-US", {
      ...UTC,
      hour: "numeric",
      minute: "2-digit",
    });
    expect(text).toBe("3:04 – 5:00 PM");
  });

  it("leaves out what both dates share, in every locale", () => {
    const first = new Date(Date.UTC(2026, 9, 1));
    expect(formatDateRange(first, OCT_31, "en-GB", DAY)).toBe("1 – 31 Oct");
    expect(formatDateRange(OCT_31, NOV_30, "fr-FR", DAY)).toBe(
      "31 oct. – 30 nov.",
    );
    expect(
      formatDateRange(OCT_31, new Date(Date.UTC(2027, 0, 2)), "de-DE", {
        ...DAY,
        year: "numeric",
      }),
    ).toBe("31. Okt. 2026 – 2. Jan. 2027");
  });

  it("reads ISO strings and timestamps like formatDate", () => {
    expect(
      formatDateRange(OCT_31.toISOString(), NOV_30.getTime(), "en-US", DAY),
    ).toBe("Oct 31 – Nov 30");
  });

  it("writes the start alone without a valid end, or with one before it", () => {
    expect(formatDateRange(OCT_31, null, "en-US", DAY)).toBe("Oct 31");
    expect(formatDateRange(OCT_31, "not a date", "en-US", DAY)).toBe("Oct 31");
    expect(formatDateRange(NOV_30, OCT_31, "en-US", DAY)).toBe("Nov 30");
  });

  it("answers null when the start is not a date", () => {
    expect(formatDateRange(undefined, NOV_30, "en-US", DAY)).toBeNull();
    expect(formatDateRange("soon", NOV_30, "en-US", DAY)).toBeNull();
  });

  it("applies the user's time zone and date format", () => {
    // 23:30 UTC on 30 Sep is already 1 Oct in Brussels.
    const lateEvening = new Date(Date.UTC(2026, 8, 30, 23, 30));
    setRegionalPreferencesSource(() => ({
      timeZone: "Europe/Brussels",
      dateFormat: "numeric",
    }));
    expect(
      formatDateRange(lateEvening, NOV_30, "en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    ).toBe("01/10/2026 – 30/11/2026");
  });
});

describe("formatDate", () => {
  it("keeps a calendar day in the local zone when asked", () => {
    const localDay = new Date(2026, 9, 31);
    expect(
      formatDate(
        localDay,
        "en-US",
        { month: "short", day: "numeric" },
        {
          keepLocalZone: true,
        },
      ),
    ).toBe("Oct 31");
  });
});

describe("useRegionalFormat().formatDateRange", () => {
  const locale = ref("en-GB");

  beforeEach(() => {
    locale.value = "en-GB";
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key, locale }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes the span in the interface language", () => {
    const { formatDateRange: formatSpan } = useRegionalFormat();
    expect(formatSpan(OCT_31, NOV_30, DAY)).toBe("31 Oct – 30 Nov");
    locale.value = "fr-FR";
    expect(formatSpan(OCT_31, NOV_30, DAY)).toBe("31 oct. – 30 nov.");
  });
});

describe("formatPeriodRange", () => {
  it("still writes a period's label with plain spaces", () => {
    const range = {
      from: new Date(2026, 7, 31),
      to: new Date(2026, 8, 29, 23, 59, 59, 999),
    };
    const text = formatPeriodRange(range, "en-GB");
    expect(text).toBe("31 Aug – 29 Sept 2026");
    expect(text).not.toMatch(ICU_SPACES);
  });
});
