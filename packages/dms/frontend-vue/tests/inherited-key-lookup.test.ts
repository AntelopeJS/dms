import { describe, expect, it } from "vitest";
import { readAt } from "../layers/dms-core/app/entries/composables/user/preferencesCookie";
import { storedSidePanelWidth } from "../layers/dms-ui/app/entries/composables/layout/sidePanelState";
import { resolveFormSuccessTarget } from "../layers/dms-ui/app/entries/composables/table-view/registerDefaultFunctions";
import { loadCodeHighlighter } from "../layers/dms-ui/app/entries/utils/codeHighlight";
import {
  codeLanguageLabel,
  resolveCodeLanguage,
} from "../layers/dms-ui/app/entries/utils/codeLanguages";
import { resolveSketchLinks } from "../layers/dms-ui/app/entries/utils/sketch";

const INHERITED = ["constructor", "toString", "hasOwnProperty"];

describe("a name Object.prototype holds is no key of a table that never stored it", () => {
  it("keeps a form's preserved query parameter out of the redirect when the URL lacks it", () => {
    for (const key of INHERITED) {
      expect(
        resolveFormSuccessTarget(
          { url: "/done", preserveQuery: [key] },
          { params: {}, query: {} },
        ),
        key,
      ).toEqual({ path: "/done" });
    }
  });

  it("shows a code language named like an inherited member as written", async () => {
    for (const language of ["constructor", "valueof", "tostring"]) {
      expect(resolveCodeLanguage(language), language).toBe(language);
      expect(codeLanguageLabel(language), language).toBe(language);
      const highlight = await loadCodeHighlighter(language);
      expect(highlight("a b"), language).toEqual([{ text: "a b" }]);
    }
  });

  it("fills a sketch link's route token named like an inherited member with nothing", () => {
    const html = (name: string) =>
      `<a href="/mockup?id={{params.${name}}}" target="_top">go</a>`;
    for (const name of INHERITED) {
      expect(
        resolveSketchLinks(html(name), {
          origin: "https://x.test",
          params: {},
        }),
        name,
      ).toBe('<a href="https://x.test/mockup?id=" target="_top">go</a>');
    }
  });

  it("reads no preference at a path through an inherited member", () => {
    for (const key of INHERITED) {
      expect(readAt({}, [key]), key).toBeUndefined();
    }
  });

  it("gives a side panel named like an inherited member its default width", () => {
    const bounds = { defaultWidth: 320, minWidth: 100, maxWidth: 600 };
    for (const id of INHERITED) {
      expect(
        storedSidePanelWidth({ openId: null, widths: {} }, id, bounds),
        id,
      ).toBe(320);
    }
  });
});
