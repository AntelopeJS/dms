import { expect } from "chai";
import { GetTheme, SetTheme } from "../../../implementations/dms-builder";
import { destroyFixture, expectOk } from "./harness";
import {
  brandingFiles,
  createThemeFixture,
  draft,
  OP_TIMEOUT,
  PNG_LOGO,
  readLayerFile,
  upload,
} from "./helpers/theme-harness";

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

describe("theme reset to the DMS default", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    createThemeFixture();
  });

  afterEach(() => {
    destroyFixture();
  });

  it("writes files free of overrides for the draft the editor's reset sends, and keeps the layer", async () => {
    const custom = expectOk(
      await SetTheme(
        draft({
          variables: {
            shared: {
              ...Object.fromEntries(
                SHADES.map((shade) => [`--color-brand-${shade}`, "#336699"]),
              ),
              "--ui-radius": "0.5rem",
            },
            light: { "--ui-bg": "#fafafa" },
            dark: { "--ui-bg": "#111111" },
          },
          colors: { primary: "brand", error: "rose" },
          uploads: [upload("default", "light", PNG_LOGO, "image/png")],
        }),
      ),
      "SetTheme",
    );
    const customized = expectOk(await GetTheme(), "GetTheme");
    expect(brandingFiles()).to.have.length(1);

    expectOk(
      await SetTheme(
        draft({
          variables: { shared: {}, light: {}, dark: {} },
          colors: {},
          logos: {},
          uploads: [],
        }),
        { expectedVersion: custom.version },
      ),
      "SetTheme",
    );

    expect(readLayerFile("app/assets/css/theme.css")).to.equal("");
    const config = readLayerFile("app/app.config.ts");
    for (const gone of ["colors", "brand", "rose", "branding", "logo"]) {
      expect(config).not.to.contain(gone);
    }
    expect(config).to.contain('button: { slots: { base: "font-bold" } }');
    expect(brandingFiles()).to.deep.equal([]);
    const entry = readLayerFile("dms.frontend.ts");
    expect(entry).to.contain('import "./app/assets/css/theme.css";');
    expect(entry).to.contain("sdk.registerComponent");
    const reset = expectOk(await GetTheme(), "GetTheme");
    expect(reset.variables).to.deep.equal({ shared: {}, light: {}, dark: {} });
    expect(reset.colors).to.deep.equal({});
    expect(reset.logos).to.deep.equal({});
    expect(reset.layer).to.deep.equal(customized.layer);
    expect(reset.stylesheetImported).to.equal(true);
  });
});
