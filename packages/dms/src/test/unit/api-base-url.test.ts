import { expect } from "chai";
import { getApiBaseUrl, getConfig, setDevApiBaseUrl } from "../../config";
import { GetApiBaseUrl } from "../../implementations/dms/api-base-url";

const PUBLIC_API = "https://api.example.com";
const DEV_API = "http://127.0.0.1:5999";

describe("[unit] api base url", () => {
  let configured: string | undefined;

  beforeEach(() => {
    configured = getConfig().apiBaseUrl;
  });

  afterEach(() => {
    getConfig().apiBaseUrl = configured;
    setDevApiBaseUrl(undefined);
  });

  it("answers the configured apiBaseUrl", () => {
    getConfig().apiBaseUrl = PUBLIC_API;
    expect(GetApiBaseUrl()).to.equal(PUBLIC_API);
  });

  it("answers the dev server's origin over the configured one", () => {
    getConfig().apiBaseUrl = PUBLIC_API;
    setDevApiBaseUrl(DEV_API);
    expect(getApiBaseUrl()).to.equal(DEV_API);
  });

  it("is undefined when nothing configures it", () => {
    getConfig().apiBaseUrl = undefined;
    expect(getApiBaseUrl()).to.equal(undefined);
  });
});
