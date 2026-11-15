import { expect } from "chai";
import {
  type PageVerifyReport,
  redactVerifyReport,
} from "../../../mcp/page-verify";
import { type RedactedQueryPreview, redactPreview } from "../../../mcp/redact";

const ROW_VALUES = [
  "Qx Acme",
  "Qx Globex",
  "4471.5",
  "zq_paid",
  "Zq paid",
  "The Rock",
  "qx@acme.io",
  "4471",
  "john-smith",
  "dup key",
];

const REFUSED = "the page refused owner@example.test: its layout answered 403";

function expectNoRowValue(
  answer: RedactedQueryPreview | PageVerifyReport,
): void {
  const text = JSON.stringify(answer);
  for (const value of ROW_VALUES) {
    expect(text, `answered ${value}`).to.not.include(value);
  }
}

function verifyReport(): PageVerifyReport {
  return {
    ok: false,
    dashboardUrl: "http://localhost:5173",
    account: { kind: "owner", email: "owner@example.test" },
    screenshots: ".antelope/page-verify/run",
    notes: ["Writes held back (submit: false): PUT /api/orders/john-smith"],
    pages: [
      {
        page: "/orders",
        ok: false,
        failures: [],
        render: { viewports: [] },
        data: [
          {
            path: "page.table",
            type: "TableView",
            state: "ok",
            viewport: "desktop",
            source: "/api/orders?status=zq_paid",
          },
        ],
        errors: {
          console: [
            {
              viewport: "desktop",
              text: 'E11000 dup key { email: "qx@acme.io" }',
            },
            { viewport: "desktop", text: 'TypeError: no row "Qx Acme"' },
          ],
          failedRequests: [
            {
              viewport: "desktop",
              method: "GET",
              url: "http://localhost:5173/api/orders/4471?status=zq_paid",
              status: 500,
            },
            {
              viewport: "desktop",
              method: "GET",
              url: "http://localhost:5173/api/customers/john-smith",
              status: 404,
            },
            {
              viewport: "desktop",
              method: "GET",
              url: "http://localhost:5173/api/orders?page=2",
              status: 500,
            },
          ],
        },
        interactions: [
          {
            kind: "tab",
            target: 'tab "Zq paid"',
            ok: false,
            detail: "stayed unselected after a click",
          },
          {
            kind: "link",
            target: 'link "Dwayne "The Rock" Johnson" → /customers/qx@acme.io',
            ok: false,
            detail: "answered 404",
          },
          {
            kind: "form",
            target: 'form "Order "Qx Globex"" opened by "Qx Acme"',
            ok: true,
            detail:
              'not checked: the click opened a menu of "Qx Acme", "4471.5"',
          },
        ],
        permissions: [],
      },
      {
        page: "/accounts",
        ok: false,
        failures: [REFUSED],
        render: { viewports: [] },
        data: [],
        errors: { console: [], failedRequests: [] },
        interactions: [],
        permissions: [],
      },
    ],
  };
}

/**
 * The query previews and the page checks the AI reads carry no value a page or a query read from
 * rows. An implementation that passes a preview body through, or keeps the names a page shows on
 * its tabs, links, buttons and menus, or a request's query string, fails here.
 */
describe("[unit] the previews and page checks the AI reads", () => {
  it("answer a query preview's types, not its values", () => {
    const redacted = redactPreview(
      {
        output: "series",
        response: "items",
        truncated: false,
        body: {
          items: [
            { id: 1, title: "Qx Acme", value: 4471.5, delta: null },
            { id: 2, title: "Qx Globex", value: 12, delta: 3 },
          ],
        },
      },
      "ok",
    );
    expectNoRowValue(redacted);
    expect(redacted.status).to.equal("ok");
    expect(redacted.body).to.deep.equal({
      items: {
        length: 2,
        items: [
          { id: "number", title: "string", value: "number", delta: "null" },
          { id: "number", title: "string", value: "number", delta: "number" },
        ],
      },
    });
  });

  it("answer a page check with ordinals for what the page shows", () => {
    const redacted = redactVerifyReport(verifyReport());
    expectNoRowValue(redacted);
    const [orders, accounts] = redacted.pages;
    expect(orders.interactions.map((entry) => entry.target)).to.deep.equal([
      "tab #1",
      "link #1",
      "form #1",
    ]);
    expect(orders.interactions[2].detail).to.equal(
      "not checked: the click opened a menu",
    );
    expect(
      orders.errors.failedRequests.map((entry) => entry.url),
    ).to.deep.equal([
      "http://localhost:5173/…",
      "http://localhost:5173/…",
      "http://localhost:5173/api/orders",
    ]);
    expect(orders.errors.console.map((entry) => entry.text)).to.deep.equal([
      "console error",
      "TypeError",
    ]);
    expect(orders.data[0].source).to.equal("/api/orders");
    expect(redacted.notes).to.deep.equal([
      "Writes held back (submit: false): PUT /…",
    ]);
    expect(orders.failures).to.include(
      "tab: tab #1: stayed unselected after a click",
    );
    expect(orders.data[0].state).to.equal("ok");
    expect(accounts.failures).to.deep.equal([REFUSED]);
  });
});
