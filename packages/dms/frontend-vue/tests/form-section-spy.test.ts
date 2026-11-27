// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { host, mountForm } from "./helpers/form-runtime";

const current = () =>
  host.querySelector('[aria-current="location"]')?.getAttribute("href");

async function mountSections(tops: number[]) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const index = Number(this.dataset.section?.slice(1)) - 1;
      return new DOMRect(0, tops[index] ?? 0, 100, 100);
    },
  );
  await mountForm({
    sections: tops.map((_, index) => ({
      id: `s${index + 1}`,
      label: `Section ${index + 1}`,
      fieldIds: [],
    })),
    sectionNav: "jump",
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("currentSectionId", () => {
  it("is the first section before any has passed the reading line", async () => {
    await mountSections([400, 900, 1400]);
    expect(current()).toBe("#dms-form-form-section-s1");
  });
  it("is the last section whose top has passed the reading line", async () => {
    await mountSections([-700, -150, 80, 400]);
    expect(current()).toBe("#dms-form-form-section-s3");
  });
  it("is the last section once the form is scrolled to its end", async () => {
    vi.spyOn(window, "scrollY", "get").mockReturnValue(900);
    await mountSections([-900, -300, 250, 520]);
    expect(current()).toBe("#dms-form-form-section-s4");
  });
  it("is none without sections", async () => {
    await mountForm();
    expect(current()).toBeUndefined();
  });
});

it("rejects a scroll spy that selects the last section of an unscrolled form or loses a clicked section mid-scroll", async () => {
  await mountSections([0, 600]);
  vi.useFakeTimers();
  expect(current()).toBe("#dms-form-form-section-s1");
  host
    .querySelector<HTMLAnchorElement>('a[href="#dms-form-form-section-s2"]')
    ?.click();
  document.dispatchEvent(new Event("scroll"));
  await vi.advanceTimersByTimeAsync(20);
  await nextTick();
  expect(current()).toBe("#dms-form-form-section-s2");
  expect(window.location.hash).toBe("#dms-form-form-section-s2");
  await vi.advanceTimersByTimeAsync(150);
  document.dispatchEvent(new Event("scroll"));
  await vi.advanceTimersByTimeAsync(20);
  await nextTick();
  expect(current()).toBe("#dms-form-form-section-s1");
});
