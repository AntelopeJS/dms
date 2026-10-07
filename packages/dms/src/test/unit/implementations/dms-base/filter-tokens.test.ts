import type { Parameters } from "@antelopejs/interface-data-api/components";
import { expect } from "chai";
import {
  resolveFilterTokens,
  resolveFilterValueTokens,
} from "../../../../implementations/dms-base/filter-tokens";

const NOW = new Date("2026-10-05T09:30:00.000Z");
const CONTEXT = { userId: "user-42", now: NOW };

// A request's filters as the list route parses them: `filter_<field>` gives
// the value and the compare mode as written, which the type does not know.
const asFilters = (filters: Record<string, [string, string]>) =>
  filters as unknown as Parameters.ListParameters["filters"];

describe("[unit] dms-base — filter tokens", () => {
  it("replaces the caller's id", () => {
    expect(resolveFilterValueTokens("{{user.id}}", CONTEXT)).to.equal(
      "user-42",
    );
    expect(resolveFilterValueTokens("{{ user.id }}", CONTEXT)).to.equal(
      "user-42",
    );
  });

  it("replaces now, moved by whole days either way", () => {
    expect(resolveFilterValueTokens("{{now}}", CONTEXT)).to.equal(
      "2026-10-05T09:30:00.000Z",
    );
    expect(resolveFilterValueTokens("{{now-7d}}", CONTEXT)).to.equal(
      "2026-09-28T09:30:00.000Z",
    );
    expect(resolveFilterValueTokens("{{now+14d}}", CONTEXT)).to.equal(
      "2026-10-19T09:30:00.000Z",
    );
  });

  it("resolves every token of a value, leaving the rest as it is", () => {
    expect(resolveFilterValueTokens("{{now}},{{now+14d}}", CONTEXT)).to.equal(
      "2026-10-05T09:30:00.000Z,2026-10-19T09:30:00.000Z",
    );
    expect(resolveFilterValueTokens("{{tenant.id}}", CONTEXT)).to.equal(
      "{{tenant.id}}",
    );
    expect(resolveFilterValueTokens("open", CONTEXT)).to.equal("open");
  });

  it("leaves no user id behind for an anonymous caller", () => {
    expect(resolveFilterValueTokens("{{user.id}}", { now: NOW })).to.equal("");
  });

  it("resolves the values of a request's filters, keeping their modes", () => {
    expect(
      resolveFilterTokens(
        asFilters({
          owner: ["{{user.id}}", "is"],
          dueAt: ["{{now+14d}}", "less_than"],
          status: ["open", "is"],
        }),
        CONTEXT,
      ),
    ).to.deep.equal({
      owner: ["user-42", "is"],
      dueAt: ["2026-10-19T09:30:00.000Z", "less_than"],
      status: ["open", "is"],
    });
    expect(resolveFilterTokens(undefined, CONTEXT)).to.equal(undefined);
  });
});
