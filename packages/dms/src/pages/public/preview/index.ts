import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import {
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { listPreviewBlockTypes, type PreviewBlockTypes } from "./block-types";
import { registerPreviewFixtures } from "./fixtures";

export * from "./block-types";

/** The bare layout of the preview: no logo, header, footer or background. */
const PREVIEW_LAYOUT = {
  componentName: "dms-preview-layout",
  options: {},
};

/** What the page hands `DmsBlockPreview`. */
interface DocsPreviewOptions {
  embed: boolean;
  blockTypes: PreviewBlockTypes;
}

/**
 * `/dms-preview`: renders a tree of registered blocks received through
 * `?state=` or `postMessage`, for a documentation site to embed in an iframe.
 * Public, since a docs visitor has no session here, and hidden from the menu.
 */
export class DocsPreviewPage extends PageController(
  "dms-preview",
  {
    displayName: "$page.dms_preview.title",
    urlSlug: "dms-preview",
    publicAccess: true,
    hidden: true,
    category: pagesCategory,

    live: {},
  },
  PREVIEW_LAYOUT,
) {
  static content = CustomComponent("DmsBlockPreview").transformOptions(
    (): DocsPreviewOptions => ({
      embed: true,
      blockTypes: listPreviewBlockTypes(),
    }),
  );
}

/**
 * Registers `/dms-preview`. Only called when the preview is enabled, which is
 * why the page carries no decorator: importing this file registers nothing.
 */
export function registerDocsPreviewPage(): void {
  registerPreviewFixtures();
  RegisterPage()(DocsPreviewPage);
}
