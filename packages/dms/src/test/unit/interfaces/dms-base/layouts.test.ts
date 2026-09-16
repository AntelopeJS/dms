import { expect } from "chai";
import {
  DefaultLayout,
  FormPageLayout,
} from "@antelopejs/interface-dms/base/layouts";

describe("[unit] interfaces/dms-base/layouts", () => {
  it("makes a page full-width when no option is given", () => {
    expect(DefaultLayout().options).to.deep.equal({ fullWidth: true });
  });

  it("keeps the full-width default when only other options are given", () => {
    expect(DefaultLayout({ hideHeader: true }).options).to.deep.equal({
      fullWidth: true,
      hideHeader: true,
    });
  });

  it("lets a page opt out of full width", () => {
    expect(DefaultLayout({ fullWidth: false }).options).to.deep.equal({
      fullWidth: false,
    });
  });

  it("constrains a form page and cannot be widened by its options", () => {
    expect(FormPageLayout().options).to.deep.equal({ fullWidth: false });
    expect(FormPageLayout({ hideHeader: true }).options).to.deep.equal({
      fullWidth: false,
      hideHeader: true,
    });
  });

  it("returns a fresh options object per call", () => {
    const first = DefaultLayout();
    const second = DefaultLayout();
    expect(first.options).to.not.equal(second.options);
  });
});
