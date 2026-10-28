import { GetCorsConfig, SetCorsConfig } from "@antelopejs/interface-api";
import { expect } from "chai";
import { allowClientOrigin } from "../../client-origin-cors";
import { getConfig } from "../../config";
import { createClient } from "../helpers/http";

const SYSTEM_STATE = "/api/system-state";
const MANUAL_ORIGIN = "https://manual.example.com";
const MANUAL_PATTERN = /^https:\/\/[a-z]+\.preview\.example\.com$/;
const STRANGER_ORIGIN = "https://stranger.example.com";

async function allowedOriginFor(origin: string) {
  const response = await createClient().get(SYSTEM_STATE, {
    headers: { origin },
  });
  return response.headers["access-control-allow-origin"];
}

describe("[integration] the dashboard's CORS origin", () => {
  const clientOrigin = () => getConfig().clientBaseUrl ?? "";

  afterEach(async () => {
    await SetCorsConfig({});
    await allowClientOrigin();
  });

  it("is allowed by the api with no CORS configured there", async () => {
    expect(await allowedOriginFor(clientOrigin())).to.equal(clientOrigin());
    expect(await allowedOriginFor(STRANGER_ORIGIN)).to.equal("false");
  });

  it("joins the origins configured on the api instead of replacing them", async () => {
    await SetCorsConfig({
      allowedOrigins: [MANUAL_ORIGIN, MANUAL_PATTERN],
      credentials: true,
    });
    await allowClientOrigin();
    await allowClientOrigin();

    expect(await GetCorsConfig()).to.deep.equal({
      allowedOrigins: [MANUAL_ORIGIN, MANUAL_PATTERN, clientOrigin()],
      credentials: true,
    });
    expect(await allowedOriginFor(MANUAL_ORIGIN)).to.equal(MANUAL_ORIGIN);
    expect(await allowedOriginFor(clientOrigin())).to.equal(clientOrigin());
  });

  it("joins a single configured origin", async () => {
    await SetCorsConfig({ allowedOrigins: MANUAL_ORIGIN });
    await allowClientOrigin();

    expect((await GetCorsConfig()).allowedOrigins).to.deep.equal([
      MANUAL_ORIGIN,
      clientOrigin(),
    ]);
  });
});
