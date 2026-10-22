/**
 * The side list of a long form marks one section, the one being read: the
 * last whose top has passed the reading line, and the last of all once the
 * form is scrolled to its end, which the sections at the bottom never rise
 * far enough to reach.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { currentSectionId } from "../layers/dms-ui/app/build/composables/form/formSections";

const sections = (...tops: number[]) =>
  tops.map((top, index) => ({ id: `s${index + 1}`, top }));

describe("currentSectionId", () => {
  it("is the first section before any has passed the reading line", () => {
    expect(
      currentSectionId({
        sections: sections(120, 600, 1100),
        readingLine: 100,
        isAtEnd: false,
      }),
    ).toBe("s1");
  });

  it("is the last section whose top has passed the reading line", () => {
    expect(
      currentSectionId({
        sections: sections(-700, -150, 80, 400),
        readingLine: 100,
        isAtEnd: false,
      }),
    ).toBe("s3");
  });

  it("is the last section once the form is scrolled to its end", () => {
    expect(
      currentSectionId({
        sections: sections(-900, -300, 250, 520),
        readingLine: 100,
        isAtEnd: true,
      }),
    ).toBe("s4");
  });

  it("is none without sections", () => {
    expect(
      currentSectionId({ sections: [], readingLine: 100, isAtEnd: true }),
    ).toBeUndefined();
  });
});

const sectionsSource = readFileSync(
  new URL(
    "../layers/dms-ui/app/build/components/form/FormSections.vue",
    import.meta.url,
  ),
  "utf8",
);
const navSource = readFileSync(
  new URL(
    "../layers/dms-ui/app/build/components/form/FormSectionNav.vue",
    import.meta.url,
  ),
  "utf8",
);

describe("the form's side list", () => {
  it("keeps a picked section current while its scroll runs", () => {
    const onScroll = /function onScroll\(\): void \{[\s\S]*?\n\}/.exec(
      sectionsSource,
    )?.[0];
    expect(onScroll).toMatch(/if \(isPicked\) \{\s*holdPicked\(\);\s*return;/);
  });

  it("starts on the first section of a form that never scrolls", () => {
    expect(sectionsSource).toContain("return scrollTop > 0 &&");
  });

  it("marks the current entry apart from the one under the pointer", () => {
    const active = /const ACTIVE_CLASSES[\s\S]*?\};/.exec(navSource)?.[0];
    expect(active).toContain("shadow-[inset_2px_0_0_var(--ui-primary)]");
  });
});
