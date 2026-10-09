/**
 * A composed text is written in the reader's language from the raw values the
 * server sends: amounts in minor units, dates, counts that pick the plural
 * form. The same JSON reads in English or in French, and follows a switch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";
import { useComposedText } from "../layers/dms-core/app/composables/translation/useComposedText";
import type { ComposedText } from "../layers/dms-core/app/types/composed-text";
import {
  isComposedText,
  resolveComposedText,
} from "../layers/dms-core/app/utils/composedText";
import { setRegionalPreferencesSource } from "../layers/dms-core/app/utils/regional";

const NOW = Date.UTC(2026, 9, 8, 12);

const MESSAGES = {
  en: {
    saas: {
      stats: { mrr: "{amount} MRR" },
      banner: { retry: "Payment failed, retry {date}" },
      seats: "no seat | {count} seat | {count} seats",
      plan_seats: "{plan} · {seats}",
      plans: { business: "Business" },
      only_english: "Renews {date}",
    },
  },
  fr: {
    saas: {
      stats: { mrr: "MRR de {amount}" },
      banner: { retry: "Paiement refusé, nouvel essai {date}" },
      seats: "aucun siège | {count} siège | {count} sièges",
      plan_seats: "{plan} · {seats}",
      plans: { business: "Business" },
    },
  },
};

function makeI18n(locale: "en" | "fr" = "en") {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: MESSAGES,
  });
}

// Intl separates a French amount from its symbol with a no-break space.
const plainSpaces = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");

function write(
  text: Parameters<typeof resolveComposedText>[0],
  locale: "en" | "fr" = "en",
): string {
  const { global } = makeI18n(locale);
  const translate = (
    key: string,
    named: Record<string, unknown>,
    plural?: number,
  ) =>
    plural === undefined ? global.t(key, named) : global.t(key, named, plural);
  return plainSpaces(
    resolveComposedText(text, { translate, locale, now: NOW }),
  );
}

const mrr = (value: number, currency = "EUR"): ComposedText => ({
  key: "saas.stats.mrr",
  params: { amount: { type: "money", value, currency } },
});

beforeEach(() => {
  setRegionalPreferencesSource(() => ({ timeZone: "UTC" }));
});

afterEach(() => {
  setRegionalPreferencesSource(() => ({}));
  vi.unstubAllGlobals();
});

describe("resolveComposedText — parameters", () => {
  it("writes an amount from its minor units, in the reader's locale", () => {
    expect(write(mrr(92200))).toBe("€922.00 MRR");
    expect(write(mrr(92200), "fr")).toBe("MRR de 922,00 €");
  });

  it("reads the minor unit of the currency", () => {
    expect(write(mrr(4500, "JPY"))).toBe("¥4,500 MRR");
  });

  it("still shows an amount whose currency code is malformed", () => {
    expect(write(mrr(92200, "euro"))).toBe("922 MRR");
  });

  it("writes a date in the format asked, medium by default", () => {
    const retry = (format?: "day" | "long"): ComposedText => ({
      key: "$saas.banner.retry",
      params: { date: { type: "date", value: "2026-10-10T12:00:00Z", format } },
    });
    expect(write(retry("day"))).toBe("Payment failed, retry Oct 10");
    expect(write(retry())).toBe("Payment failed, retry Oct 10, 2026");
    expect(write(retry("long"), "fr")).toBe(
      "Paiement refusé, nouvel essai 10 octobre 2026",
    );
  });

  it("writes a date and its time", () => {
    expect(
      write({
        key: "saas.banner.retry",
        params: {
          date: { type: "datetime", value: Date.UTC(2026, 9, 10, 14, 5) },
        },
      }),
    ).toBe("Payment failed, retry Oct 10, 2026, 2:05 PM");
  });

  it("writes a relative date from now, past or future", () => {
    const retry = (value: string): ComposedText => ({
      key: "saas.banner.retry",
      params: { date: { type: "relative", value } },
    });
    expect(write(retry("2026-10-10T12:00:00Z"))).toBe(
      "Payment failed, retry in 2 days",
    );
    expect(write(retry("2026-10-09T12:00:00Z"), "fr")).toBe(
      "Paiement refusé, nouvel essai demain",
    );
  });

  it("writes numbers for the locale, as a percentage or compact on request", () => {
    const value = (amount: ComposedText["params"]): ComposedText => ({
      key: "saas.stats.mrr",
      params: amount,
    });
    expect(write(value({ amount: 1284.5 }), "fr")).toBe("MRR de 1 284,5");
    expect(
      write(
        value({ amount: { type: "number", value: 0.25, format: "percent" } }),
      ),
    ).toBe("25% MRR");
    expect(
      write(
        value({ amount: { type: "number", value: 1300, format: "compact" } }),
      ),
    ).toBe("1.3K MRR");
  });

  it("inserts a string parameter as written, never as a key", () => {
    expect(
      write({ key: "saas.stats.mrr", params: { amount: "$not.a.key" } }),
    ).toBe("$not.a.key MRR");
  });

  it("composes a nested text first", () => {
    expect(
      write({
        key: "saas.plan_seats",
        params: {
          plan: { key: "$saas.plans.business" },
          seats: {
            key: "saas.seats",
            params: { count: { type: "count", value: 3 } },
          },
        },
      }),
    ).toBe("Business · 3 seats");
  });
});

describe("resolveComposedText — plurals", () => {
  const seats = (value: number): ComposedText => ({
    key: "saas.seats",
    params: { count: { type: "count", value } },
  });

  it("picks the form from the count parameter", () => {
    expect([0, 1, 1200].map((value) => write(seats(value)))).toEqual([
      "no seat",
      "1 seat",
      "1,200 seats",
    ]);
    expect(write(seats(2), "fr")).toBe("2 sièges");
  });

  it("picks the form from the parameter `plural` names", () => {
    expect(
      write({ key: "saas.seats", params: { count: 1 }, plural: "count" }),
    ).toBe("1 seat");
  });
});

describe("resolveComposedText — fallbacks", () => {
  it("falls back to the fallback language, parameters included", () => {
    expect(
      write(
        {
          key: "saas.only_english",
          params: {
            date: { type: "date", value: "2026-10-10", format: "day" },
          },
        },
        "fr",
      ),
    ).toBe("Renews 10 oct.");
  });

  it("shows the bare key when no language has the message", () => {
    expect(write({ key: "$saas.missing", params: { amount: 1 } })).toBe(
      "saas.missing",
    );
  });

  it("shows the raw value of a date that is not one", () => {
    const retry = (type: "date" | "relative"): ComposedText => ({
      key: "saas.banner.retry",
      params: { date: { type, value: "soon" } },
    });
    expect(write(retry("date"))).toBe("Payment failed, retry soon");
    expect(write(retry("relative"))).toBe("Payment failed, retry soon");
  });

  it("keeps a type from a newer backend readable", () => {
    expect(
      write({
        key: "saas.stats.mrr",
        params: { amount: { type: "duration", value: 90 } as never },
      }),
    ).toBe("90 MRR");
  });

  it("passes plain strings through, translates `$` keys, writes numbers", () => {
    expect(write("Plain text")).toBe("Plain text");
    expect(write("$saas.plans.business")).toBe("Business");
    expect(write(1284, "fr")).toBe("1 284");
    expect(write(undefined)).toBe("");
    expect(write(null)).toBe("");
  });

  it("tells a composed text from other values", () => {
    expect(isComposedText(mrr(1))).toBe(true);
    expect(isComposedText("saas.stats.mrr")).toBe(false);
    expect(isComposedText({ type: "money", value: 1 })).toBe(false);
    expect(isComposedText(null)).toBe(false);
  });
});

describe("useComposedText", () => {
  it("follows a language switch", () => {
    const i18n = makeI18n("en");
    vi.stubGlobal("useI18n", () => ({
      t: i18n.global.t,
      locale: i18n.global.locale,
    }));
    const { processText } = useComposedText();
    const text = mrr(92200);

    expect(plainSpaces(processText(text))).toBe("€922.00 MRR");
    i18n.global.locale.value = "fr";
    expect(plainSpaces(processText(text))).toBe("MRR de 922,00 €");
  });
});
