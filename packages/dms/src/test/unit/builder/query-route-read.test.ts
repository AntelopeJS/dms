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
        'return chartCardData(await model.revenue(new Date(from), new Date(to)).run(), { measure: "sum", label: "Amount", previous: await model.revenue(new Date(compareFrom), new Date(compareTo)).run() });',
      ),
    );
    expect(call?.response).to.equal("card");
    expect(call?.compare).to.equal(true);
    expect(call?.modelMethod).to.equal("revenue");
  });

  it("reads a route that awaits the model call without running it", () => {
    const call = parseQueryRouteCall(
      routeMethod(
        'return chartCardData(await model.revenue(new Date(from), new Date(to)), { measure: "sum", label: "Amount" });',
      ),
    );
    expect(call?.modelMethod).to.equal("revenue");
    expect(call?.args).to.have.length(2);
  });

  it("reads a card whose bounds are narrowed from the query string as comparing", () => {
    const call = parseQueryRouteCall(
      routeMethod(
        'return chartCardData(await model.revenue(new Date(String(from)), new Date(String(to))), { measure: "sum", label: "Amount", previous: await model.revenue(new Date(String(compareFrom)), new Date(String(compareTo))) });',
      ),
    );
    expect(call?.args).to.deep.equal([
      { kind: "param", name: "from", coerce: "date" },
      { kind: "param", name: "to", coerce: "date" },
    ]);
    expect(call?.compare).to.equal(true);
  });

  it("reads a text bound narrowed from the query string as its parameter", () => {
    const call = parseQueryRouteCall(
      routeMethod("return { value: await model.revenue(String(from)) };"),
    );
    expect(call?.args).to.deep.equal([{ kind: "param", name: "from" }]);
  });

  it("reads a card without one as not comparing", () => {
    const call = parseQueryRouteCall(
      routeMethod(
        'return chartCardData(await model.revenue(new Date(from), new Date(to)).run(), { measure: "sum", label: "Amount" });',
      ),
    );
    expect(call?.response).to.equal("card");
    expect(call?.compare).to.equal(undefined);
  });
});
