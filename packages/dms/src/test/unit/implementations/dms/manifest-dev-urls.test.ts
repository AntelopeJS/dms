import { expect } from "chai";
import {
  applyDevManifestUrls,
  devOriginRewrites,
} from "../../../../store/frontend";

const CONFIGURED = {
  apiBaseUrl: "http://127.0.0.1:5010",
  clientBaseUrl: "http://localhost:3001",
};

describe("[unit] development manifest origins", () => {
  it("lists each configured origin the dev manifest replaces, with its override", () => {
    expect(
      devOriginRewrites(CONFIGURED, {
        apiBaseUrl: "http://localhost:5011",
        clientBaseUrl: "http://localhost:3002",
      }),
    ).to.deep.equal([
      { from: "http://127.0.0.1:5010", to: "http://localhost:5011" },
      { from: "http://localhost:3001", to: "http://localhost:3002" },
    ]);
  });

  it("lists no origin without an override, as the manifest leaves it", () => {
    const overrides = { apiBaseUrl: "http://localhost:5011" };
    const manifest = applyDevManifestUrls(
      {
        modules: [
          {
            options: {
              baseURL: "http://127.0.0.1:5010/api",
              clientBaseUrl: "http://localhost:3001",
            },
          },
        ],
      },
      CONFIGURED,
      overrides,
    );
    expect(devOriginRewrites(CONFIGURED, overrides)).to.deep.equal([
      { from: "http://127.0.0.1:5010", to: "http://localhost:5011" },
    ]);
    expect(manifest.modules[0].options).to.deep.equal({
      baseURL: "http://localhost:5011/api",
      clientBaseUrl: "http://localhost:3001",
    });
  });
});
