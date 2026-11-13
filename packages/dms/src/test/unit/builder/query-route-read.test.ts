import { expect } from "chai";
import { Project, type MethodDeclaration } from "ts-morph";
import { parseQueryRouteCall } from "../../../implementations/dms-builder/engine";

/** The route method of a page, as the builder writes one. */
function routeMethod(body: string): MethodDeclaration {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(
    "page.ts",
    `class Page {
  async revenue(@Model(OrderModel) model: OrderModel, from: string, to: string, compareFrom: string, compareTo: string) {
    ${body}
  }
}`,
  );
  return file.getClassOrThrow("Page").getMethodOrThrow("revenue");
}

/**
 * Whether a route answers the period before is read off the route itself: the
 * calculation is the same one, handed to the helper a second time.
 */
describe("reading whether a route compares", () => {
  it("reads a card handed the preceding period as comparing", () => {
    const call = parseQueryRouteCall(
      routeMethod(
        'return chartCardData(await model.revenue(new Date(from), new Date(to)), { measure: "sum", label: "Amount", previous: await model.revenue(new Date(compareFrom), new Date(compareTo)) });',
      ),
    );
    expect(call?.response).to.equal("card");
    expect(call?.compare).to.equal(true);
  });

  it("reads a card without one as not comparing", () => {
    const call = parseQueryRouteCall(
      routeMethod(
        'return chartCardData(await model.revenue(new Date(from), new Date(to)), { measure: "sum", label: "Amount" });',
      ),
    );
    expect(call?.response).to.equal("card");
    expect(call?.compare).to.equal(undefined);
  });
});
