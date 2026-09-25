import { expect } from "chai";
import { clientIpFromForwardedFor } from "../../routes/auth/client-ip";

describe("[unit] clientIpFromForwardedFor", () => {
  it("keeps the client address out of a proxy chain", () => {
    expect(
      clientIpFromForwardedFor("109.132.199.8,195.201.71.66,104.23.166.64"),
    ).to.equal("109.132.199.8");
  });

  it("trims the spaces proxies put after the separators", () => {
    expect(clientIpFromForwardedFor(" 2001:db8::1 , 10.0.0.1")).to.equal(
      "2001:db8::1",
    );
  });

  it("returns a single address as is", () => {
    expect(clientIpFromForwardedFor("203.0.113.7")).to.equal("203.0.113.7");
  });

  it("returns an empty string without a header", () => {
    expect(clientIpFromForwardedFor(undefined)).to.equal("");
    expect(clientIpFromForwardedFor("")).to.equal("");
  });
});
