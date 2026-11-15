import { expect } from "chai";
import {
  type PageVerifyReport,
  redactVerifyReport,
} from "../../../mcp/page-verify";
import { type RedactedQueryPreview, redactPreview } from "../../../mcp/redact";

const ROW_VALUES = ["Qx Acme", "Qx Globex", "4471.5", "zq_paid", "Zq paid"];

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
    notes: [],
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
          },
        ],
        errors: {
          console: [],
          failedRequests: [
            {
              viewport: "desktop",
              method: "GET",
              url: "http://localhost:5173/api/orders?status=zq_paid",
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
            target: 'link "Qx Acme" → /orders/1',
            ok: true,
            detail: "answered 200",
          },
          {
            kind: "form",
            target: 'button "Qx Globex"',
            ok: false,
            detail:
              'not checked: the click opened a menu of "Qx Acme", "4471.5"',
          },
        ],
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
    const redacted = redactPreview({
      output: "series",
      response: "items",
      truncated: false,
      body: {
        items: [
          { id: 1, title: "Qx Acme", value: 4471.5, delta: null },
          { id: 2, title: "Qx Globex", value: 12, delta: 3 },
        ],
      },
    });
    expectNoRowValue(redacted);
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
    const [page] = redacted.pages;
    expect(page.interactions.map((entry) => entry.target)).to.deep.equal([
      "tab #1",
      "link #1 → /orders/1",
      "button #1",
    ]);
    expect(page.errors.failedRequests[0].url).to.equal(
      "http://localhost:5173/api/orders",
    );
    expect(page.failures).to.include(
      "tab: tab #1: stayed unselected after a click",
    );
    expect(page.data[0].state).to.equal("ok");
  });
});
