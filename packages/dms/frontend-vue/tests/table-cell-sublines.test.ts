// @vitest-environment jsdom
/**
 * The secondary lines of the table cells — under a status pill, under an
 * identity's name, under a `two_line` primary — draw a composed text from the
 * row in the reader's language and in the tone the row gives it; an identity
 * without a value stands as its empty label and icon.
 */
import {
  createApp,
  defineComponent,
  h,
  ref,
  type App,
  type VNodeChild,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";
import type { DataType } from "../layers/dms-core/app/composables/data-types/useDataType";
import { setRegionalPreferencesSource } from "../layers/dms-core/app/utils/regional";
import { readSubline } from "../layers/dms-ui/app/build/composables/data-types/cellHelpers";
import { registerMetricCellTypes } from "../layers/dms-ui/app/build/composables/data-types/metricCells";
import { registerTwoLineCellType } from "../layers/dms-ui/app/build/composables/data-types/twoLineCell";

// The renderers registerDefaults imports beside the identity's.
const stub = { default: { render: () => null } };
vi.mock("@nuxt/ui/components/Avatar.vue", () => stub);
vi.mock("@nuxt/ui/components/Badge.vue", () => stub);
vi.mock("@nuxt/ui/components/Link.vue", () => stub);
vi.mock("@nuxt/ui/runtime/vue/components/Icon.vue", () => stub);

vi.mock("../layers/dms-ui/app/composables/useFileReadUrls", () => ({
  useFileReadUrls: () => ({ getUrl: () => undefined, resolve: () => {} }),
}));

const IdentityCell = (
  await import(
    "../layers/dms-ui/app/build/components/table-view/IdentityCell.vue"
  )
).default;

const i18n = createI18n({
  legacy: false,
  locale: "en",
  fallbackLocale: "en",
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    en: {
      saas: {
        invoice: {
          open: "Open",
          retry: "Payment failed · retry {date}",
          due: "Due {date}",
        },
        plan_seats:
          "{price} × {count} seat / {interval} | {price} × {count} seats / {interval}",
        month: "month",
        at_risk: "At risk",
        renews_in: "Renews tomorrow | Renews in {count} days",
        automatic: "Automatic",
        joined: "Joined",
      },
    },
    fr: {
      saas: {
        invoice: { retry: "Paiement refusé · nouvel essai le {date}" },
      },
    },
  },
});

type Formatter = (
  value: unknown,
  locale: string,
  options?: unknown,
  row?: Record<string, unknown>,
) => VNodeChild;

const formatters = new Map<string, DataType["formatter"]>();
const register = (dataType: DataType) =>
  formatters.set(dataType.id, dataType.formatter);
registerMetricCellTypes(register);
registerTwoLineCellType(register);
// The column types a two-line primary is written by.
register({
  id: "price",
  formatter: {
    default: (value) => `€${Number(value).toFixed(2)}`,
  },
});
register({
  id: "select",
  formatter: {
    default: (value, _locale, options) =>
      (
        options as { items: Array<{ value: string; label: string }> }
      ).items.find((item) => item.value === value)?.label,
  },
});

const format = (id: string, kind: "default" | "empty" = "default") =>
  formatters.get(id)![kind] as Formatter;

let app: App | undefined;

const render = (content: () => VNodeChild): HTMLElement => {
  const container = document.createElement("div");
  app = createApp(defineComponent({ setup: () => content }));
  app.component(
    "UIcon",
    defineComponent({
      props: { name: { type: String, default: "" } },
      setup: (props) => () => h("i", { "data-icon": props.name }),
    }),
  );
  app.component(
    "UAvatar",
    defineComponent({
      props: { text: { type: String, default: "" } },
      setup: (props) => () => h("span", { "data-avatar": "" }, props.text),
    }),
  );
  app.component("UBadge", defineComponent({ setup: () => () => h("b") }));
  app.mount(container);
  return container;
};

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/[\u00a0\u202f]/g, " ");

const retry = {
  key: "$saas.invoice.retry",
  params: { date: { type: "date", value: "2026-10-10", format: "day" } },
};

beforeEach(() => {
  i18n.global.locale.value = "en";
  setRegionalPreferencesSource(() => ({ timeZone: "UTC" }));
  vi.stubGlobal("useI18n", () => ({
    t: i18n.global.t,
    locale: i18n.global.locale,
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) =>
      value.startsWith("$") ? i18n.global.t(value.slice(1)) : value,
  }));
  vi.stubGlobal("useDataTypes", () => ({
    getDataType: (id: string) => ({ id, formatter: formatters.get(id) }),
  }));
  vi.stubGlobal("useCurrentUser", () => ({ user: ref(null) }));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
  setRegionalPreferencesSource(() => ({}));
});

describe("readSubline", () => {
  const processText = (value: unknown) =>
    typeof value === "string" ? value.replace(/^\$/, "i18n:") : "composed";

  it("reads a text with its tone, a composed text, a string, or nothing", () => {
    const reading = { processText, isStringTranslated: true };
    expect(readSubline({ text: retry, tone: "error" }, reading)).toEqual({
      text: "composed",
      tone: "error",
    });
    expect(readSubline(retry, reading)).toEqual({ text: "composed" });
    expect(readSubline("$saas.due", reading)).toEqual({
      text: "i18n:saas.due",
    });
    expect(readSubline(null, reading)).toBeUndefined();
    expect(readSubline({ text: "" }, reading)).toBeUndefined();
  });

  it("keeps a data string as written when strings are not texts", () => {
    expect(
      readSubline("$29 a month", { processText, isStringTranslated: false }),
    ).toEqual({ text: "$29 a month" });
  });
});

describe("status_pill sub-line", () => {
  const options = {
    tones: { open: "info" },
    subField: "statusDetail",
    typeOptions: { items: [{ value: "open", label: "$saas.invoice.open" }] },
  };

  it("composes the row's sub-line in the reader's language, in the row's tone", () => {
    const cell = render(() =>
      format("status_pill")("open", "en", options, {
        statusDetail: { text: retry, tone: "error" },
      }),
    );
    const sub = cell.querySelector("span.text-xs");
    expect(text(sub)).toBe("Payment failed · retry Oct 10");
    expect(sub?.className).toContain("text-error");
  });

  it("follows a language switch", () => {
    i18n.global.locale.value = "fr";
    const cell = render(() =>
      format("status_pill")("open", "fr", options, { statusDetail: retry }),
    );
    expect(text(cell.querySelector("span.text-xs"))).toBe(
      "Paiement refusé · nouvel essai le 10 oct.",
    );
  });

  it("draws a sub-line without a tone in subTone, else in the pill's", () => {
    const due = {
      key: "saas.invoice.due",
      params: { date: { type: "date", value: "2026-10-28", format: "day" } },
    };
    const muted = render(() =>
      format("status_pill")(
        "open",
        "en",
        { ...options, subTone: "muted" },
        {
          statusDetail: due,
        },
      ),
    );
    expect(muted.querySelector("span.text-xs")?.className).toContain(
      "text-muted",
    );
    app?.unmount();
    const pillTone = render(() =>
      format("status_pill")("open", "en", options, { statusDetail: due }),
    );
    expect(text(pillTone.querySelector("span.text-xs"))).toBe("Due Oct 28");
    expect(pillTone.querySelector("span.text-xs")?.className).toContain(
      "text-info",
    );
  });
});

describe("two_line", () => {
  it("writes the primary line with the column's type, the plan's price under it", () => {
    const cell = render(() =>
      format("two_line")(
        "pro",
        "en",
        {
          subField: "planDetail",
          columnType: "select",
          typeOptions: { items: [{ value: "pro", label: "Business" }] },
        },
        {
          planDetail: {
            key: "saas.plan_seats",
            params: {
              price: { type: "money", value: 2900, currency: "EUR" },
              count: { type: "count", value: 23 },
              interval: { key: "saas.month" },
            },
          },
        },
      ),
    );
    const [primary, sub] = cell.querySelectorAll("span > span");
    expect(text(primary)).toBe("Business");
    expect(text(sub)).toBe("€29.00 × 23 seats / month");
    expect(sub?.className).toContain("text-muted");
  });

  it("keeps an amount in its column format, what it means in the row's tone", () => {
    const cell = render(() =>
      format("two_line")(
        49,
        "en",
        { subField: "mrrNote", columnType: "price" },
        { mrrNote: { text: "$saas.at_risk", tone: "error" } },
      ),
    );
    const [primary, sub] = cell.querySelectorAll("span > span");
    expect(text(primary)).toBe("€49.00");
    expect(text(sub)).toBe("At risk");
    expect(sub?.className).toContain("text-error");
  });

  it("reads its primary line off another field, even when the value is empty", () => {
    const cell = render(() =>
      format("two_line", "empty")(
        null,
        "en",
        {
          primaryField: "renewal",
          subField: "renewalDate",
          subTone: "warning",
        },
        {
          renewal: {
            key: "saas.renews_in",
            params: { count: { type: "count", value: 3 } },
          },
          renewalDate: {
            key: "saas.invoice.due",
            params: { date: { type: "date", value: "2026-10-12" } },
          },
        },
      ),
    );
    const [primary, sub] = cell.querySelectorAll("span > span");
    expect(text(primary)).toBe("Renews in 3 days");
    expect(text(sub)).toBe("Due Oct 12, 2026");
    expect(sub?.className).toContain("text-warning");
  });

  it("draws its empty label for an empty primary line, and no sub-line for none", () => {
    const cell = render(() =>
      format("two_line", "empty")(
        undefined,
        "en",
        { subField: "note", emptyLabel: "$saas.automatic" },
        {},
      ),
    );
    expect(text(cell)).toBe("Automatic");
    expect(cell.querySelectorAll("span > span")).toHaveLength(1);
    app?.unmount();
    expect(
      text(render(() => format("two_line", "empty")(null, "en", {}, {}))),
    ).toBe("—");
  });

  it("composes a value that is itself a composed text", () => {
    const cell = render(() =>
      format("two_line")(
        {
          key: "saas.renews_in",
          params: { count: { type: "count", value: 1 } },
        },
        "en",
        {},
        {},
      ),
    );
    expect(text(cell)).toBe("Renews tomorrow");
  });
});

describe("IdentityCell", () => {
  const mountIdentity = (props: Record<string, unknown>) =>
    render(() => h(IdentityCell, props));

  it("stands an empty row as its muted label and icon tile", () => {
    const cell = mountIdentity({
      title: "",
      emptyLabel: "Automatic",
      emptyIcon: "i-ph-robot",
    });
    expect(text(cell)).toBe("Automatic");
    expect(cell.querySelector("[data-icon]")?.getAttribute("data-icon")).toBe(
      "i-ph-robot",
    );
    expect(cell.querySelector("[data-avatar]")).toBeNull();
    expect(cell.querySelector(".text-muted")).not.toBeNull();
  });

  it("keeps the avatar and the name of a row with a value", () => {
    const cell = mountIdentity({
      title: "Camille Martin",
      emptyLabel: "Automatic",
      emptyIcon: "i-ph-robot",
    });
    expect(text(cell)).toContain("Camille Martin");
    expect(text(cell.querySelector("[data-avatar]"))).toBe("CM");
    expect(cell.querySelector("[data-icon]")).toBeNull();
  });

  it("draws the subtitle under the empty label, in its tone", () => {
    const cell = mountIdentity({
      title: "",
      subtitle: "Refund · duplicate charge",
      subtitleClass: "text-warning",
      emptyLabel: "Automatic",
    });
    const sub = cell.querySelector(".text-xs");
    expect(text(sub)).toBe("Refund · duplicate charge");
    expect(sub?.className).toContain("text-warning");
  });

  it("lets the subtitle stand as the name without an empty label, as before", () => {
    const cell = mountIdentity({ title: "", subtitle: "ada@example.com" });
    expect(text(cell.querySelector(".truncate"))).toBe("ada@example.com");
    expect(cell.querySelector(".text-xs")).toBeNull();
  });
});

describe("identity sub-line", () => {
  const identityFormatter = async () => {
    const registered = new Map<string, DataType["formatter"]>();
    // Auto-imports of the layer the other default types are registered with.
    vi.stubGlobal("h", h);
    for (const name of [
      "formatNumber",
      "formatPrice",
      "formatPercentage",
      "formatTimeSpan",
      "formatDate",
      "getBooleanLabel",
    ]) {
      vi.stubGlobal(name, () => "");
    }
    vi.stubGlobal("useDataTypes", () => ({
      registerDataType: (dataType: DataType) =>
        registered.set(dataType.id, dataType.formatter),
    }));
    const { registerDefaultDataTypes } = await import(
      "../layers/dms-ui/app/build/composables/data-types/registerDefaults"
    );
    registerDefaultDataTypes();
    return registered.get("identity")!;
  };

  it("composes a subtitle the row gives as a composed text, in its tone", async () => {
    const identity = await identityFormatter();
    const cell = render(() =>
      (identity.default as Formatter)(
        "Camille Martin",
        "en",
        { subtitleField: "ownerState" },
        { ownerState: { text: "$saas.joined", tone: "success" } },
      ),
    );
    const sub = cell.querySelector(".text-xs");
    expect(text(sub)).toBe("Joined");
    expect(sub?.className).toContain("text-success");
  });

  it("keeps a plain subtitle as written, in subtitleTone", async () => {
    const identity = await identityFormatter();
    const cell = render(() =>
      (identity.default as Formatter)(
        "Acme",
        "en",
        { subtitleField: "price", subtitleTone: "muted" },
        { price: "$29 a month" },
      ),
    );
    const sub = cell.querySelector(".text-xs");
    expect(text(sub)).toBe("$29 a month");
    expect(sub?.className).toContain("text-muted");
  });

  it("draws an empty issuer as its translated empty label and icon", async () => {
    const identity = await identityFormatter();
    const cell = render(() =>
      (identity.empty as Formatter)(
        null,
        "en",
        { emptyLabel: "$saas.automatic", emptyIcon: "i-ph-robot" },
        {},
      ),
    );
    expect(text(cell)).toBe("Automatic");
    expect(cell.querySelector("[data-icon]")?.getAttribute("data-icon")).toBe(
      "i-ph-robot",
    );
  });
});
