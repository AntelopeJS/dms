import type { RequestContext } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { StatusType } from "@antelopejs/interface-dms/base/data-types/status-type";
import {
  type ColumnOptions,
  DefaultDisplays,
} from "@antelopejs/interface-dms/base/table-view";
import { ImplementInterface } from "@antelopejs/interface-core";
import { GetLocaleMessages } from "@antelopejs/interface-dms/html-render";
import { expect } from "chai";
import {
  type ExportLocale,
  exportLanguage,
  exportTimeZone,
  formatExportCell,
  readableColumns,
  resolveExportLocale,
  translateText,
} from "../../../../implementations/dms-base/readable-export";

// Intl separates a figure from its sign with a (narrow) no-break space.
const ANY_SPACE = /\s/g;

const FRENCH: ExportLocale = {
  messages: {
    deals: {
      title: "Affaire | Affaires",
      stage: { visit: "Visite", lost: "Perdue" },
      email: "E-mail {'@'}",
    },
    dms: {
      table: { filter: { boolean: { checked: "Oui", unchecked: "Non" } } },
    },
    on: "Allumé",
  },
  fallbackMessages: { deals: { only_english: "Only in English" } },
  formatLocale: "fr-FR",
  timeZone: "Europe/Brussels",
  hourCycle: "h23",
};

function column(
  type: ColumnOptions["type"],
  extra: Partial<ColumnOptions> = {},
): ColumnOptions {
  return { name: "Column", type, ...extra };
}

function cell(value: unknown, options: ColumnOptions): string {
  return String(formatExportCell(value, options, FRENCH)).replace(
    ANY_SPACE,
    " ",
  );
}

const SELECT = column(
  new DefaultDataTypes.SelectType({
    items: [
      { value: "visit", label: "$deals.stage.visit" },
      { value: "lost", label: "$deals.stage.lost" },
      { value: 3, label: "Three" },
    ],
  }),
);

class Customers {}
const RELATION = column(
  new DefaultDataTypes.RelationType({
    dataApiController: Customers as never,
    keyMapping: { label: "company" as never },
    filterOnly: true,
  }),
);

describe("[unit] implementations/dms-base/readable-export — texts", () => {
  it("resolves a $ key in the reader's language, its first plural form", () => {
    expect(translateText("$deals.title", FRENCH)).to.equal("Affaire");
  });

  it("falls back to English, then to the bare key", () => {
    expect(translateText("$deals.only_english", FRENCH)).to.equal(
      "Only in English",
    );
    expect(translateText("$deals.missing", FRENCH)).to.equal("deals.missing");
  });

  it("unwraps literal interpolations and keeps literals as written", () => {
    expect(translateText("$deals.email", FRENCH)).to.equal("E-mail @");
    expect(translateText("Expected close", FRENCH)).to.equal("Expected close");
  });

  it("takes the request's interface language, then the user's", () => {
    const ctx = {
      rawRequest: { headers: { "x-content-language": "fr-BE" } },
    } as unknown as RequestContext;
    const user = { language: "nl" } as User;
    expect(exportLanguage(ctx, user)).to.equal("fr");
    expect(exportLanguage(undefined, user)).to.equal("nl");
    expect(exportLanguage(undefined, undefined)).to.equal("en");
  });

  it("takes the user's saved time zone, then the browser's, UTC last", () => {
    const ctx = {
      rawRequest: { headers: { "x-time-zone": "America/New_York" } },
    } as unknown as RequestContext;
    const unknownZone = {
      rawRequest: { headers: { "x-time-zone": "Mars/Olympus" } },
    } as unknown as RequestContext;
    const user = { timeZone: "Europe/Brussels" } as User;
    expect(exportTimeZone(ctx, user)).to.equal("Europe/Brussels");
    expect(exportTimeZone(ctx, {} as User)).to.equal("America/New_York");
    expect(exportTimeZone(unknownZone, undefined)).to.equal("UTC");
    expect(exportTimeZone(undefined, undefined)).to.equal("UTC");
  });

  it("writes keys rather than failing when the texts cannot be read", async () => {
    ImplementInterface(
      { GetLocaleMessages },
      {
        GetLocaleMessages: async () => {
          throw new Error("frontend unreachable");
        },
      },
    );
    try {
      const locale = await resolveExportLocale(undefined, undefined);
      expect(translateText("$deals.title", locale)).to.equal("deals.title");
    } finally {
      ImplementInterface(
        { GetLocaleMessages },
        { GetLocaleMessages: async () => ({ messages: {}, fallback: {} }) },
      );
    }
  });
});

describe("[unit] implementations/dms-base/readable-export — cells", () => {
  it("writes an option's label, a list of them joined", () => {
    expect(cell("visit", SELECT)).to.equal("Visite");
    expect(cell(["visit", "lost"], SELECT)).to.equal("Visite, Perdue");
    expect(cell("3", SELECT)).to.equal("Three");
    expect(cell("unknown", SELECT)).to.equal("unknown");
  });

  it("names a related row by its label, an unjoined one by its id", () => {
    expect(cell({ _id: "c1", company: "Acme" }, RELATION)).to.equal("Acme");
    expect(cell("c1", RELATION)).to.equal("c1");
    expect(
      cell(
        [
          { _id: "c1", company: "Acme" },
          { _id: "c2", company: "Globex" },
        ],
        RELATION,
      ),
    ).to.equal("Acme, Globex");
  });

  it("writes a date as a day in the reader's zone", () => {
    const date = column(new DefaultDataTypes.DateType());
    expect(cell("2027-01-09T00:00:00.000Z", date)).to.equal("09/01/2027");
    expect(
      cell(
        {
          start: "2027-01-09T00:00:00.000Z",
          end: "2027-01-12T00:00:00.000Z",
        },
        date,
      ),
    ).to.equal("09/01/2027 – 12/01/2027");
  });

  it("adds the time where the grid draws it to the minute", () => {
    const relative = column(new DefaultDataTypes.DateType(), {
      display: new DefaultDisplays.RelativeDateDisplay(),
    });
    const byDay = column(new DefaultDataTypes.DateType(), {
      display: new DefaultDisplays.RelativeDateDisplay({ style: "day" }),
    });
    const instant = new Date("2026-10-01T14:05:00.000Z");
    expect(cell(instant, relative)).to.equal("01/10/2026 16:05");
    expect(cell(instant, byDay)).to.equal("01/10/2026");
  });

  it("words a boolean Yes or No, or with its indicator's labels", () => {
    const flag = column(new DefaultDataTypes.BooleanType());
    const indicator = column(new DefaultDataTypes.BooleanType(), {
      display: new DefaultDisplays.IndicatorDisplay({
        onLabel: "$on",
        offLabel: "Off",
      }),
    });
    expect(cell(true, flag)).to.equal("Oui");
    expect(cell(false, flag)).to.equal("Non");
    expect(cell(true, indicator)).to.equal("Allumé");
    expect(cell(false, indicator)).to.equal("Off");
  });

  it("words a status with its own labels", () => {
    const status = column(
      new StatusType({ onlineLabel: "Up", offlineLabel: "Down" }),
    );
    expect(cell(true, status)).to.equal("Up");
    expect(cell(false, status)).to.equal("Down");
  });

  it("writes a percentage with its sign, numbers and prices as numbers", () => {
    const percentage = column(new DefaultDataTypes.PercentageType());
    expect(cell(0.45, percentage)).to.equal("45 %");
    expect(cell(0.125, percentage)).to.equal("12,5 %");
    expect(
      formatExportCell(
        1250.5,
        column(new DefaultDataTypes.PriceType()),
        FRENCH,
      ),
    ).to.equal(1250.5);
    expect(
      formatExportCell(7, column(new DefaultDataTypes.NumberType()), FRENCH),
    ).to.equal(7);
  });

  it("writes an address on one line", () => {
    const address = column(new DefaultDataTypes.AddressType());
    expect(
      cell(
        {
          streetName: "Rue de Loncin",
          houseNumber: "234",
          postalCode: "4460",
          city: "Grâce-Hollogne",
          countryCode: "BE",
        },
        address,
      ),
    ).to.equal("Rue de Loncin 234, 4460 Grâce-Hollogne, BE");
  });

  it("leaves an empty value empty", () => {
    expect(cell(undefined, SELECT)).to.equal("");
    expect(cell(null, RELATION)).to.equal("");
    expect(cell([], SELECT)).to.equal("");
  });

  it("words a field without a column as plainly as it can", () => {
    expect(formatExportCell("text", undefined, FRENCH)).to.equal("text");
    expect(formatExportCell(true, undefined, FRENCH)).to.equal("Oui");
    expect(formatExportCell({ name: "Acme" }, undefined, FRENCH)).to.equal(
      "Acme",
    );
  });
});

describe("[unit] implementations/dms-base/readable-export — headers", () => {
  it("names each field by its translated column, a price by its currency", () => {
    const columns = readableColumns(
      ["title", "amount", "internalCode"],
      {
        title: column(new DefaultDataTypes.StringType(), {
          name: "$deals.title",
        }),
        amount: column(new DefaultDataTypes.PriceType(), { name: "Amount" }),
      },
      FRENCH,
    );
    expect(columns.map(({ header }) => header)).to.deep.equal([
      "Affaire",
      "Amount (EUR)",
      "internalCode",
    ]);
    expect(columns.map(({ key }) => key)).to.deep.equal([
      "title",
      "amount",
      "internalCode",
    ]);
  });
});
