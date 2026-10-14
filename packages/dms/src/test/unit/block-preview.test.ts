import { expect } from "chai";
import { ListBlockTypes } from "@antelopejs/interface-dms/base/block-types";
import { getConfig, isDocsPreviewEnabled } from "../../config";
import { listPreviewBlockTypes } from "../../pages/public/preview/block-types";

const DOCS_PREVIEW_ENV = "DMS_DOCS_PREVIEW";

describe("[unit] block preview", () => {
  describe("isDocsPreviewEnabled", () => {
    let configured: boolean | undefined;
    let environment: string | undefined;

    beforeEach(() => {
      configured = getConfig().docsPreview;
      environment = process.env[DOCS_PREVIEW_ENV];
      getConfig().docsPreview = undefined;
      delete process.env[DOCS_PREVIEW_ENV];
    });

    afterEach(() => {
      getConfig().docsPreview = configured;
      if (environment === undefined) delete process.env[DOCS_PREVIEW_ENV];
      else process.env[DOCS_PREVIEW_ENV] = environment;
    });

    it("is off by default", () => {
      expect(isDocsPreviewEnabled()).to.equal(false);
    });

    it("is on when the module config sets docsPreview", () => {
      getConfig().docsPreview = true;
      expect(isDocsPreviewEnabled()).to.equal(true);
    });

    it("is on when DMS_DOCS_PREVIEW is 1, and only then", () => {
      process.env[DOCS_PREVIEW_ENV] = "true";
      expect(isDocsPreviewEnabled()).to.equal(false);
      process.env[DOCS_PREVIEW_ENV] = "1";
      expect(isDocsPreviewEnabled()).to.equal(true);
    });
  });

  describe("listPreviewBlockTypes", () => {
    it("lists every registered block type by its factory name", () => {
      const listed = listPreviewBlockTypes();
      const registered = ListBlockTypes().map(({ type }) => type);
      expect(Object.keys(listed)).to.have.members(registered);
      expect(listed.KpiCard).to.deep.equal({ componentName: "dms-kpi-card" });
    });

    it("carries a chart's fixed type and flags blocks needing a controller", () => {
      const listed = listPreviewBlockTypes();
      expect(listed.ChartLine).to.deep.equal({
        componentName: "dms-chart",
        fixedOptions: { type: "line" },
      });
      expect(listed.TableView.needsController).to.equal(true);
      expect(listed.ResourceForm.needsController).to.equal(true);
    });

    it("lists the LiveToggle the block-types barrel registers", () => {
      expect(listPreviewBlockTypes().LiveToggle).to.deep.equal({
        componentName: "dms-live-toggle-block",
      });
    });
  });
});
