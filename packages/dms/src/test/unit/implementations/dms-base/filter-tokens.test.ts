import type { Parameters } from "@antelopejs/interface-data-api/components";
import { expect } from "chai";
import {
  resolveFilterTokens,
  resolveFilterValueTokens,
} from "../../../../implementations/dms-base/services";

const NOW = new Date("2026-10-05T09:30:00.000Z");
const CONTEXT = { userId: "user-42", now: NOW };

function asFilters(
  filters: Record<string, [string, string] | [string, string][]>,
): Parameters.ListParameters["filters"] {
  // @ts-expect-error These fixtures preserve opaque frontend modes (is/less_than/greater_than), outside the owner's eq/ne/gt/ge/lt/le union, while testing token interpolation only.
  return filters;
}

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

  it("resolves each filter of a field filtered several times", () => {
    expect(
      resolveFilterTokens(
        asFilters({
          dueAt: [
            ["{{now-7d}}", "greater_than"],
            ["{{now}}", "less_than"],
          ],
        }),
        CONTEXT,
      ),
    ).to.deep.equal({
      dueAt: [
        ["2026-09-28T09:30:00.000Z", "greater_than"],
        ["2026-10-05T09:30:00.000Z", "less_than"],
      ],
    });
  });
});
