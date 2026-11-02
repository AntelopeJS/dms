import { AuthRawUser } from "@antelopejs/interface-dms/auth";
import {
  decoratedClass,
  prototypeOf,
} from "@antelopejs/interface-dms/utils/internal/decorated-class";
import { expect } from "chai";

class Decorated {}

const BOUND = Decorated.bind(null);

describe("[unit] interfaces/dms-base — decorator targets", () => {
  it("answers the class a member decorator decorates", () => {
    expect(decoratedClass(Decorated.prototype)).to.equal(Decorated);
  });

  it("refuses a target whose constructor is not a class", () => {
    const target = { constructor: () => undefined };

    expect(() => decoratedClass(target)).to.throw(
      TypeError,
      "A member decorator applies to a class.",
    );
  });

  it("answers the prototype of a class", () => {
    expect(prototypeOf(Decorated)).to.equal(Decorated.prototype);
  });

  it("refuses a class that has no prototype object", () => {
    expect(() => prototypeOf(BOUND)).to.throw(
      TypeError,
      "bound Decorated has no prototype to decorate",
    );
  });

  it("refuses a class decorator applied to a function that is no class", () => {
    expect(() => {
      AuthRawUser()(BOUND);
    }).to.throw(TypeError, "A class decorator applies to a class.");
  });

  it("applies a class decorator to a class", () => {
    expect(() => {
      AuthRawUser()(Decorated);
    }).not.to.throw();
  });
});
