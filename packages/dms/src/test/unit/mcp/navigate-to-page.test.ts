import { expect } from "chai";
import { MCP_TOOLS } from "../../../mcp/tools";
import { registerConnection, unregisterConnection } from "../../../realtime";
import { pagesBySlug } from "../../../utils";

const CONNECTION_ID = "navigate-to-page-connection";

const navigateToPage = MCP_TOOLS.find(
  (tool) => tool.name === "navigate_to_page",
)!;

const registeredRoute = (): string =>
  Object.keys(pagesBySlug).find((slug) => !slug.includes(":")) ?? "/orders";

describe("navigate_to_page", () => {
  afterEach(() => {
    unregisterConnection(CONNECTION_ID);
  });

  it("sends the page to the leader tab of each open connection", async () => {
    const sent: { eventName: string; data: unknown }[] = [];
    registerConnection(CONNECTION_ID, {
      userId: "user",
      send: (eventName, data) => sent.push({ eventName, data }),
      close: async () => {},
    });

    const route = registeredRoute();
    const result = await navigateToPage.call({ path: `${route}/` });

    expect(sent).to.have.lengthOf(1);
    expect(sent[0]).to.deep.include({ eventName: "leader" });
    expect(sent[0]!.data).to.deep.include({
      topic: "dms:navigate",
      type: "navigate",
      payload: { path: route },
    });
    expect(result.content[0]).to.deep.include({ type: "text" });
    expect(JSON.stringify(result)).to.include("Moved the dashboard tab");
  });

  it("says no tab moved when no dashboard is open", async () => {
    const result = await navigateToPage.call({ path: registeredRoute() });

    expect(JSON.stringify(result)).to.include("No dashboard tab is open");
  });
});
