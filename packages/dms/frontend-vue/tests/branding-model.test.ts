/**
 * The Branding editor's state is one typed edit moved by pure functions:
 * what the bar counts, what Save sends, how a draft follows newer files, and
 * where the simple mode's logo goes.
 */
import { describe, expect, it } from "vitest";
import {
  changeCount,
  customAccentOf,
  editOf,
  isAtDefaults,
  isBrandVariable,
  placeLogos,
  rebaseTheme,
  resetToDms,
  settleSave,
  setColor,
  setCustomAccent,
  setFont,
  setVariable,
  simpleLogoSlots,
  toSetThemeDraft,
  type PendingLogo,
  type SavedTheme,
  type ThemeEdit,
} from "../layers/dms-layout/app/entries/branding/model";

type Theme = SavedTheme["theme"];

function theme(partial: Partial<Theme> = {}): Theme {
  return {
    variables: { shared: {}, light: {}, dark: {}, ...partial.variables },
    colors: { ...partial.colors },
    logos: { ...partial.logos },
  };
}

function saved(partial: Partial<Theme> = {}, version = "v1"): SavedTheme {
  return { theme: theme(partial), version, layer: "/project/frontend-vue" };
}

const LOGO: PendingLogo = {
  contentType: "image/svg+xml",
  base64Content: "PHN2Zy8+",
  fileName: "logo.svg",
};

describe("changeCount", () => {
  it("counts a value set in one mode apart from the same name in the other", () => {
    const edit = setVariable(
      editOf(
        saved({
          variables: { shared: {}, light: { "--ui-bg": "#fff" }, dark: {} },
        }),
      ),
      "dark",
      "--ui-bg",
      "#fff",
    );
    expect(changeCount(edit)).toBe(1);
  });

  it("counts no change for a value cleared then typed again", () => {
    const start = editOf(
      saved({
        variables: { shared: { "--ui-radius": "0.5rem" }, light: {}, dark: {} },
      }),
    );
    const cleared = setVariable(start, "shared", "--ui-radius", "");
    expect(changeCount(cleared)).toBe(1);
    expect(
      changeCount(setVariable(cleared, "shared", "--ui-radius", "0.5rem")),
    ).toBe(0);
  });

  it("counts a picked logo once per slot and mode it goes to", () => {
    const edit = placeLogos(editOf(saved()), [
      { slot: "default", mode: "light", logo: LOGO },
      { slot: "email", mode: "light", logo: LOGO },
      { slot: "default", mode: "dark", logo: LOGO },
    ]);
    expect(changeCount(edit)).toBe(3);
  });
});

describe("rebaseTheme", () => {
  it("keeps the draft's changes and takes the files' other changes", () => {
    const from = theme({ colors: { primary: "violet" } });
    const draft = theme({ colors: { primary: "green" } });
    const onto = theme({ colors: { primary: "violet", info: "sky" } });
    expect(rebaseTheme(draft, from, onto).colors).toEqual({
      primary: "green",
      info: "sky",
    });
  });

  it("keeps a value the draft removed removed, though the files still hold it", () => {
    const from = theme({
      variables: { shared: { "--font-sans": "Inter" }, light: {}, dark: {} },
    });
    const onto = theme({
      variables: {
        shared: { "--font-sans": "Inter" },
        light: { "--ui-bg": "#eee" },
        dark: {},
      },
    });
    expect(rebaseTheme(theme(), from, onto).variables).toEqual({
      shared: {},
      light: { "--ui-bg": "#eee" },
      dark: {},
    });
  });
});

describe("toSetThemeDraft", () => {
  it("sends trimmed values and every picked logo as an upload in place of its path", () => {
    const start = editOf(
      saved({ logos: { default: { light: "/branding/old.svg" } } }),
    );
    const edit = placeLogos(
      setVariable(start, "light", "--ui-bg", " #fafafa "),
      [{ slot: "default", mode: "light", logo: LOGO }],
    );
    const body = toSetThemeDraft(edit);
    expect(body.variables.light).toEqual({ "--ui-bg": "#fafafa" });
    expect(body.logos).toEqual({});
    expect(body.uploads).toEqual([
      {
        slot: "default",
        mode: "light",
        contentType: LOGO.contentType,
        base64Content: LOGO.base64Content,
      },
    ]);
  });
});

describe("simpleLogoSlots", () => {
  it("fills the square slots too while they show the DMS icon", () => {
    expect(simpleLogoSlots(editOf(saved()), "light")).toEqual([
      "default",
      "email",
      "collapsed",
      "favicon",
    ]);
  });

  it("keeps filling the square slots that follow the logo", () => {
    const edit = placeLogos(
      editOf(saved()),
      simpleLogoSlots(editOf(saved()), "dark").map((slot) => ({
        slot,
        mode: "dark" as const,
        logo: LOGO,
      })),
    );
    expect(simpleLogoSlots(edit, "dark")).toContain("collapsed");
  });

  it("leaves the square slots to an icon of their own", () => {
    const edit = editOf(
      saved({
        logos: {
          default: { light: "/branding/logo-0000aaaa.svg" },
          collapsed: { light: "/branding/icon-1111bbbb.svg" },
        },
      }),
    );
    expect(simpleLogoSlots(edit, "light")).toEqual(["default", "email"]);
  });
});

describe("resetToDms", () => {
  it("drops every override and picked logo, each counted as a change", () => {
    const start = placeLogos(
      editOf(
        saved({
          colors: { primary: "violet" },
          logos: { favicon: { dark: "/f.png" } },
        }),
      ),
      [{ slot: "default", mode: "light", logo: LOGO }],
    );
    const reset = resetToDms(start);
    expect(reset.draft).toEqual(theme());
    expect(reset.pendingLogos).toEqual({});
    expect(changeCount(reset)).toBe(2);
  });

  it("puts back the accent, the radius, the font, the backgrounds and the brand palette", () => {
    const start = [
      (edit: ThemeEdit) => setCustomAccent(edit, "#e11d48"),
      (edit: ThemeEdit) => setColor(edit, "error", "rose"),
      (edit: ThemeEdit) => setVariable(edit, "shared", "--ui-radius", "0.5rem"),
      (edit: ThemeEdit) => setFont(edit, "Georgia, serif"),
      (edit: ThemeEdit) => setVariable(edit, "light", "--ui-bg", "#fafafa"),
      (edit: ThemeEdit) => setVariable(edit, "dark", "--ui-bg", "#111111"),
    ].reduce((edit, change) => change(edit), editOf(saved()));
    expect(isAtDefaults(start)).toBe(false);

    const reset = resetToDms(start);

    expect(customAccentOf(reset.draft)).toBeUndefined();
    expect(reset.draft.colors).toEqual({});
    expect(reset.draft.variables).toEqual({ shared: {}, light: {}, dark: {} });
    expect(changeCount(reset)).toBe(0);
    expect(isAtDefaults(reset)).toBe(true);
  });
});

describe("isAtDefaults", () => {
  it("holds for a theme with no override, whatever the files held", () => {
    expect(isAtDefaults(editOf(saved()))).toBe(true);
    const overridden = editOf(
      saved({
        colors: { primary: "violet" },
        logos: { default: { light: "/a.svg" } },
      }),
    );
    expect(isAtDefaults(overridden)).toBe(false);
    expect(isAtDefaults(resetToDms(overridden))).toBe(true);
  });

  it.each([
    [
      "a variable",
      {
        variables: { shared: { "--ui-radius": "0" }, light: {}, dark: {} },
      },
    ],
    ["a palette", { colors: { success: "emerald" } }],
    ["a logo path", { logos: { favicon: { dark: "/f.png" } } }],
  ] satisfies [string, Partial<Theme>][])(
    "does not hold with %s still set",
    (_, partial) => {
      expect(isAtDefaults(editOf(saved(partial)))).toBe(false);
    },
  );

  it("does not hold with a logo picked and not yet saved", () => {
    const picked = placeLogos(editOf(saved()), [
      { slot: "default", mode: "light", logo: LOGO },
    ]);
    expect(isAtDefaults(picked)).toBe(false);
  });
});

describe("settleSave", () => {
  it("keeps an edit made while the save was in flight on top of what it wrote", () => {
    const sent = placeLogos(
      setVariable(editOf(saved()), "shared", "--ui-radius", "0rem"),
      [{ slot: "favicon", mode: "light", logo: LOGO }],
    );
    const during = setVariable(sent, "light", "--ui-bg", "#000");
    const onDisk = saved(
      {
        variables: { shared: { "--ui-radius": "0rem" }, light: {}, dark: {} },
        logos: { favicon: { light: "/branding/favicon-0000aaaa.svg" } },
      },
      "v2",
    );
    const settled = settleSave(during, sent, onDisk);
    expect(settled.pendingLogos).toEqual({});
    expect(settled.draft.logos).toEqual(onDisk.theme.logos);
    expect(changeCount(settled)).toBe(1);
  });
});

describe("the module's value refusals, checked before Save", () => {
  it("refuses what the module refuses: open brackets, fetched images, a spaced !important", async () => {
    const { valueProblem } = await import(
      "../layers/dms-layout/app/entries/branding/model"
    );
    expect(valueProblem("calc(1rem")).toBe("unbalanced");
    expect(valueProblem('"Inter')).toBe("unbalanced");
    expect(valueProblem('image-set("a.png" 1x)')).toBe("unsafe");
    expect(valueProblem("src(foo)")).toBe("unsafe");
    expect(valueProblem("#fff ! important")).toBe("unsafe");
    expect(
      valueProblem('calc(1rem + 2px) "Inter", sans-serif'),
    ).toBeUndefined();
  });

  it("measures a value as Save sends it, without the spaces around it", async () => {
    const { valueProblem, MAX_VALUE_LENGTH } = await import(
      "../layers/dms-layout/app/entries/branding/model"
    );
    expect(
      valueProblem(`#ffffff${" ".repeat(MAX_VALUE_LENGTH)}`),
    ).toBeUndefined();
    expect(valueProblem("a".repeat(MAX_VALUE_LENGTH + 1))).toBe("too_long");
  });

  it("refuses an empty logo file", async () => {
    const { logoRefusal } = await import(
      "../layers/dms-layout/app/entries/branding/model"
    );
    expect(logoRefusal({ name: "a.png", type: "image/png", size: 0 })).toBe(
      "branding.logo.empty",
    );
  });
});

describe("the custom accent", () => {
  const brandNames = (edit: ReturnType<typeof editOf>) =>
    Object.keys(edit.draft.variables.shared).filter(isBrandVariable);

  it("sets the brand palette as the primary, its 11 shades in the shared set", () => {
    const edit = setCustomAccent(editOf(saved()), "#3b82f6");
    expect(edit.draft.colors.primary).toBe("brand");
    expect(brandNames(edit)).toHaveLength(11);
    expect(edit.draft.variables.shared["--color-brand-500"]).toBe("#3b82f6");
    expect(edit.draft.variables.light).toEqual({});
    expect(customAccentOf(edit.draft)).toBe("#3b82f6");
  });

  it("counts as one change, and one again for another color, whatever the shades", () => {
    const first = setCustomAccent(editOf(saved()), "#3b82f6");
    expect(changeCount(first)).toBe(1);
    const second = setCustomAccent(first, "#e11d48");
    expect(changeCount(second)).toBe(1);
    expect(changeCount(setCustomAccent(second, "#3b82f6"))).toBe(1);
  });

  it("counts no change for the color the files already hold", () => {
    const held = setCustomAccent(editOf(saved()), "#3b82f6").draft;
    const reopened = editOf(saved(held));
    expect(changeCount(reopened)).toBe(0);
    expect(changeCount(setCustomAccent(reopened, "#e11d48"))).toBe(1);
    expect(
      changeCount(
        setCustomAccent(setCustomAccent(reopened, "#e11d48"), "#3b82f6"),
      ),
    ).toBe(0);
  });

  it("goes back to a preset by removing the brand shades and keeping other variables", () => {
    const withRadius = setVariable(
      setCustomAccent(editOf(saved()), "#3b82f6"),
      "shared",
      "--ui-radius",
      "0.5rem",
    );
    const preset = setColor(withRadius, "primary", "violet");
    expect(preset.draft.colors.primary).toBe("violet");
    expect(brandNames(preset)).toEqual([]);
    expect(preset.draft.variables.shared["--ui-radius"]).toBe("0.5rem");
    expect(customAccentOf(preset.draft)).toBeUndefined();
  });

  it("goes back to the DMS palette the same way", () => {
    const dms = setColor(
      setCustomAccent(editOf(saved()), "#3b82f6"),
      "primary",
      undefined,
    );
    expect(dms.draft.colors).toEqual({});
    expect(brandNames(dms)).toEqual([]);
    expect(changeCount(dms)).toBe(0);
  });

  it("counts the return from a saved custom accent to a preset as one change", () => {
    const held = setCustomAccent(editOf(saved()), "#3b82f6").draft;
    const preset = setColor(editOf(saved(held)), "primary", "violet");
    expect(changeCount(preset)).toBe(1);
  });

  it("keeps the brand shades when another role changes palette", () => {
    const edit = setColor(
      setCustomAccent(editOf(saved()), "#3b82f6"),
      "success",
      "lime",
    );
    expect(brandNames(edit)).toHaveLength(11);
    expect(edit.draft.colors).toEqual({ primary: "brand", success: "lime" });
  });

  it("ignores a value that is not a hex color", () => {
    const start = editOf(saved());
    expect(setCustomAccent(start, "violet")).toBe(start);
  });

  it("sends the primary and the shades in the body of Save", () => {
    const body = toSetThemeDraft(setCustomAccent(editOf(saved()), "#3b82f6"));
    expect(body.colors).toEqual({ primary: "brand" });
    expect(
      Object.keys(body.variables.shared).filter(isBrandVariable),
    ).toHaveLength(11);
  });
});
