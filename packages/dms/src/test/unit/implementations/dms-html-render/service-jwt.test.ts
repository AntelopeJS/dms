import { assert, expect } from "chai";
import { decode } from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { applyConfig, getHtmlRenderConfig } from "../../../../config";
import { generateServiceToken } from "../../../../implementations/dms-html-render/services";

const RENDER_TOKEN_LIFETIME_SECONDS = 5 * 60;
const RENDER_TOKEN_MIN_JTI_LENGTH = 16;
const DEFAULT_SERVICE_TOKEN_LIFETIME = 5 * 60 * 1000;

interface ServiceTokenClaims extends JwtPayload {
  iat: number;
  exp: number;
}

function decodeServiceToken(serviceTokenLifetime: number): ServiceTokenClaims {
  applyConfig({
    htmlRender: { ...getHtmlRenderConfig(), serviceTokenLifetime },
  });
  const claims = decode(generateServiceToken(), { json: true });
  assert.isNotNull(claims);
  assert.isDefined(claims.iat);
  assert.isDefined(claims.exp);
  return { ...claims, iat: claims.iat, exp: claims.exp };
}

describe("[unit] implementations/dms-html-render — generateServiceToken", () => {
  const initialConfig = { ...getHtmlRenderConfig() };

  afterEach(() => {
    applyConfig({ htmlRender: initialConfig });
  });

  it("mints claims the frontend render server accepts", () => {
    const payload = decodeServiceToken(DEFAULT_SERVICE_TOKEN_LIFETIME);
    const now = Math.floor(Date.now() / 1000);

    expect(payload.namespace).to.equal("html-render-service");
    expect(payload.purpose).to.equal("html-render");
    expect(payload.aud).to.equal("dms-frontend");
    expect(payload.jti).to.have.length.of.at.least(RENDER_TOKEN_MIN_JTI_LENGTH);
    expect(payload.iat).to.be.at.most(now);
    expect(payload.exp).to.be.greaterThan(now);
    expect(payload.exp - payload.iat).to.be.at.most(
      RENDER_TOKEN_LIFETIME_SECONDS,
    );
  });

  it("reads the configured lifetime as milliseconds", () => {
    const payload = decodeServiceToken(90_000);

    expect(payload.exp - payload.iat).to.equal(90);
  });
});
