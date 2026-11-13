import {
  getRegisteredRouteHandlers,
  getRegisteredRoutes,
  UnregisterRoute,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  GetPageLayoutBySlug,
  PageMetadata,
  internal as pageInterfaceInternal,
} from "@antelopejs/interface-dms/page";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { startBuilder } from "../../../builder";
import { getBuilderConfig, setBuilderConfig } from "../../../config";
import { authorizedClient, registerUser } from "../../helpers/auth";
import { createClient } from "../../helpers/http";
import { destroyFixture } from "./harness";
import { createThemeFixture, draft, OP_TIMEOUT } from "./helpers/theme-harness";

const API = "/api/branding";
const THEME = `${API}/theme`;
const PAGE_SLUG = "/branding";

interface Answer {
  ok: boolean;
  data?: {
    version?: string;
    sourcePath?: string;
    variables?: { dark?: Record<string, string> };
  };
  error?: { code?: string };
}

function brandingRouteIds(): number[] {
  return getRegisteredRoutes()
    .filter((route) => route.location.startsWith(API))
    .map((route) => Number(route.id));
}

function unregisterBrandingPage(): void {
  for (const { handler } of getRegisteredRouteHandlers()) {
    const { pageInfo } = GetMetadata(handler.controller, PageMetadata);
    if (pageInfo?.fullSlug !== PAGE_SLUG) continue;
    pageInterfaceInternal.RegisterPage.unregister(pageInfo);
    return;
  }
}

describe("[unit] branding", function () {
  this.timeout(OP_TIMEOUT);

  const anonymous = createClient();
  let owner: AxiosInstance;
  let member: AxiosInstance;

  before(async () => {
    owner = authorizedClient((await registerUser({ owner: true })).accessToken);
    member = authorizedClient((await registerUser()).accessToken);
  });

  beforeEach(() => {
    createThemeFixture();
  });

  afterEach(() => {
    destroyFixture();
  });

  describe("on a production start", () => {
    it("serves no route and no page even with builder.enabled set, so a deployed platform has no editor", async () => {
      setBuilderConfig({ ...getBuilderConfig(), enabled: true });
      await startBuilder(false, "default");
      expect(brandingRouteIds()).to.deep.equal([]);
      expect(GetPageLayoutBySlug(PAGE_SLUG)).to.equal(undefined);
      expect((await anonymous.get(THEME)).status).to.equal(404);
      expect((await owner.get(THEME)).status).to.equal(404);
    });
  });

  describe("on a development start", () => {
    before(async () => {
      await startBuilder(true, "default");
    });

    after(() => {
      brandingRouteIds().forEach(UnregisterRoute);
      unregisterBrandingPage();
    });

    it("registers the page along with the routes, so the header icon opens something", () => {
      expect(GetPageLayoutBySlug(PAGE_SLUG)).to.not.equal(undefined);
    });

    it("answers 401 to a caller with no session, which a store-style owner check would answer 403", async () => {
      for (const send of [
        () => anonymous.get(THEME),
        () => anonymous.put(THEME, { draft: draft() }),
        () => anonymous.post(`${THEME}/layer`),
      ]) {
        expect((await send()).status).to.equal(401);
      }
    });

    it("answers 403 to a signed-in member on every route, so none is left unguarded", async () => {
      for (const send of [
        () => member.get(THEME),
        () => member.put(THEME, { draft: draft() }),
        () => member.post(`${THEME}/layer`),
      ]) {
        expect((await send()).status).to.equal(403);
      }
    });

    it("writes nothing for a member's refused save", async () => {
      await member.put(THEME, { draft: draft() });
      const read = await owner.get<Answer>(THEME);
      expect(read.data.data?.variables?.dark).to.deep.equal({});
    });

    it("gives the owner the builder's answer to GetTheme as it is, in a 200", async () => {
      const response = await owner.get<Answer>(THEME);
      expect(response.status).to.equal(200);
      expect(response.data.ok).to.equal(true);
      expect(response.data.data?.version).to.be.a("string");
    });

    it("answers 400 to a body not shaped like a save and leaves the files alone", async () => {
      const before = (await owner.get<Answer>(THEME)).data.data?.version;
      for (const body of [
        {},
        { draft: "violet" },
        { draft: { variables: {} } },
      ]) {
        expect((await owner.put(THEME, body)).status).to.equal(400);
      }
      expect((await owner.get<Answer>(THEME)).data.data?.version).to.equal(
        before,
      );
    });

    it("writes a save through SetTheme and reads it back through GetTheme", async () => {
      const read = await owner.get<Answer>(THEME);
      const saved = await owner.put<Answer>(THEME, {
        draft: draft(),
        expectedVersion: read.data.data?.version,
      });
      expect(saved.status).to.equal(200);
      expect(saved.data.ok).to.equal(true);
      const again = await owner.get<Answer>(THEME);
      expect(again.data.data?.variables?.dark).to.deep.equal({
        "--ui-bg": "#111111",
      });
      expect(again.data.data?.version).to.equal(saved.data.data?.version);
    });

    it("answers a save made against old files as a 200 refusal, for the editor to show", async () => {
      const read = await owner.get<Answer>(THEME);
      await owner.put(THEME, { draft: draft() });
      const stale = await owner.put<Answer>(THEME, {
        draft: draft(),
        expectedVersion: read.data.data?.version,
      });
      expect(stale.status).to.equal(200);
      expect(stale.data.ok).to.equal(false);
      expect(stale.data.error?.code).to.equal("stale");
    });

    it("answers not_found for a project without a layer, then creates it on POST theme/layer", async () => {
      createThemeFixture({ withLayer: false });
      const missing = await owner.get<Answer>(THEME);
      expect(missing.status).to.equal(200);
      expect(missing.data.error?.code).to.equal("not_found");
      const created = await owner.post<Answer>(`${THEME}/layer`);
      expect(created.status).to.equal(200);
      expect(created.data.ok).to.equal(true);
      expect(created.data.data?.sourcePath).to.match(/frontend-vue$/);
    });
  });
});
