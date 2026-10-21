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

    it("preserves the non-development default for callers omitting the mode", () => {
      expect(isDocsPreviewEnabled()).to.equal(false);
    });

    for (const nodeEnv of ["development", "production"]) {
      it(`uses runtime mode independently of NODE_ENV=${nodeEnv}`, () => {
        const previous = process.env.NODE_ENV;
        try {
          process.env.NODE_ENV = nodeEnv;
          expect(isDocsPreviewEnabled(true)).to.equal(true);
          expect(isDocsPreviewEnabled(false)).to.equal(false);
        } finally {
          if (previous === undefined) delete process.env.NODE_ENV;
          else process.env.NODE_ENV = previous;
        }
      });
    }

    for (const dev of [false, true]) {
      const cases = [
        { config: undefined, expected: [false, false, false, false, true] },
        { config: false, expected: [false, false, false, false, true] },
        { config: true, expected: [true, true, true, true, true] },
      ];
      for (const { config, expected } of cases) {
        for (const [index, env] of [
          undefined,
          "",
          "0",
          "true",
          "1",
        ].entries()) {
          it(`runtime dev=${dev}, docsPreview=${config}, env=${JSON.stringify(env)}`, () => {
            getConfig().docsPreview = config;
            if (env !== undefined) process.env[DOCS_PREVIEW_ENV] = env;

            expect(isDocsPreviewEnabled(dev)).to.equal(
              dev ? true : expected[index],
            );
          });
        }
      }
    }
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
