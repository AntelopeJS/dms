import { setTimeout as delay } from "node:timers/promises";
import { ListPages, Operations } from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import { BUILDER_DISABLED_MESSAGE, startBuilder } from "../../../builder";
import { getBuilderConfig, setBuilderConfig } from "../../../config";

const FAIL_FAST_MS = 1_000;
const STILL_WAITING = "still waiting for a provider";

/** Any operation of the map, called here with no arguments: the stubs read none. */
type Operation = (...args: never[]) => Promise<object | void>;

/** The rejection's message, or what the call did instead within {@link FAIL_FAST_MS}. */
async function outcomeOf(call: Promise<object | void>): Promise<string> {
  return Promise.race([
    call.then(
      () => "answered",
      (error: unknown) =>
        error instanceof Error ? error.message : "rejected with a non-Error",
    ),
    delay(FAIL_FAST_MS, STILL_WAITING),
  ]);
}

describe("[unit] builder interface with the builder off", () => {
  const configured = getBuilderConfig();

  before(async () => {
    setBuilderConfig({ ...configured, enabled: false });
    await startBuilder(false, "test");
  });

  after(() => {
    setBuilderConfig(configured);
  });

  it("rejects every operation of the Operations map at once with why, so none leaves a caller waiting", async () => {
    const operations: [string, Operation][] = Object.entries(Operations);
    const outcomes = await Promise.all(
      operations.map(async ([name, operation]) => ({
        name,
        outcome: await outcomeOf(operation()),
      })),
    );
    expect(
      outcomes.filter(({ outcome }) => outcome !== BUILDER_DISABLED_MESSAGE),
    ).to.deep.equal([]);
  });

  it("rejects an operation called by its own export at once with why", async () => {
    expect(await outcomeOf(ListPages())).to.equal(BUILDER_DISABLED_MESSAGE);
  });
});
