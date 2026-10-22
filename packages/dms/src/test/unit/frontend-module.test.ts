import { expect } from "chai";
import type { Config } from "../../config";
import { frontendModule } from "../../frontend-module";
import { findVersionDrift } from "../../implementations/dms/frontend-ready";

const PRODUCTION = { dev: false };
const CLIENT_ORIGIN = "https://dashboard.example.com";
const HALF_AN_HOUR_MS = 30 * 60 * 1000;

function productionOptions(config: Partial<Config>) {
  return frontendModule(
    { clientBaseUrl: CLIENT_ORIGIN, ...config } as Config,
    PRODUCTION,
  )?.options;
}

describe("[unit] dms frontend module", () => {
  it("computes the public options from the configuration alone", () => {
    const options = productionOptions({
      apiBaseUrl: "https://api.example.com",
      clientBaseUrl: `${CLIENT_ORIGIN}/`,
      homepage: "/home",
      auth: {
        accessTokenLifetime: HALF_AN_HOUR_MS,
        oauth: {
          providers: {
            google: { clientId: "id", clientSecret: "secret" },
            github: { clientId: "id", clientSecret: "" },
          },
        },
      } as unknown as Config["auth"],
    });
    expect(options).to.deep.include({
      baseURL: "https://api.example.com",
      clientBaseUrl: CLIENT_ORIGIN,
      homepage: "/home",
      token: { maxAgeInSeconds: 1800 },
    });
    expect(options?.oauthProviders).to.deep.equal([
      { id: "google", label: "Google", icon: "i-ph-google-logo" },
    ]);
  });

  it("refuses a production registration without the dashboard origin", () => {
    expect(() => frontendModule({} as Config, PRODUCTION)).to.throw(
      /clientBaseUrl is required in production/,
    );
  });
});

describe("[unit] frontend version drift", () => {
  const running = new Map([
    ["@antelopejs/dms-frontend-vue", "0.9.8"],
    ["@antelopejs/dms-media-frontend-vue", "0.5.1"],
  ]);

  it("names each module served at another version than the backend runs", () => {
    const drift = findVersionDrift(
      [
        { name: "@antelopejs/dms-frontend-vue", version: "0.9.8" },
        { name: "@antelopejs/dms-media-frontend-vue", version: "0.5.0" },
        { name: "@antelopejs/dms-ai-frontend-vue", version: "0.5.0" },
      ],
      running,
    );
    expect(drift).to.deep.equal([
      {
        name: "@antelopejs/dms-media-frontend-vue",
        served: "0.5.0",
        running: "0.5.1",
      },
    ]);
  });
});
