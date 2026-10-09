// @vitest-environment jsdom
import { createApp, defineComponent, h, type App } from "vue";
import { afterEach, expect, it } from "vitest";
import NavCard from "../layers/dms-ui/app/components/card/NavCard.vue";

// A nav card of the settings overview carries its page's navigation badge in
// its top corner, on the title's row, drawn as the settings nav draws it: the
// badge's soft tint, neutral grey without a tone, nothing without a count.

let app: App | undefined;

function mountCard(props: Record<string, unknown>): HTMLElement {
  app = createApp({
    render: () =>
      h(NavCard, {
        to: "/settings/user/security",
        icon: "i-ph-shield",
        title: "Security",
        description: "Password, two-step verification and sessions.",
        ...props,
      }),
  });
  app.component(
    "DmsLink",
    defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h("a", slots.default?.()),
    }),
  );
  app.component("UIcon", defineComponent({ setup: () => () => h("i") }));
  app.component("USkeleton", defineComponent({ setup: () => () => h("span") }));
  const container = document.createElement("div");
  app.mount(container);
  return container;
}

const headRow = (container: HTMLElement) =>
  container.querySelector("h3")?.parentElement as HTMLElement;

afterEach(() => {
  app?.unmount();
  app = undefined;
});

it("puts the badge last on the title's row, in its tone", () => {
  const container = mountCard({ badge: "1", badgeTone: "warning" });
  const badge = headRow(container).lastElementChild as HTMLElement;
  expect(badge.textContent?.trim()).toBe("1");
  expect(badge.className).toContain("bg-warning/12 text-warning");
  expect(badge.className).toContain("rounded-full");
  expect(badge.className).toContain("shrink-0");
  // Not repeated as a state line under the description.
  expect(container.querySelector("a")?.lastElementChild?.tagName).toBe("P");
});

it("draws a badge without a tone in neutral grey", () => {
  const container = mountCard({ badge: "59" });
  const badge = headRow(container).lastElementChild as HTMLElement;
  expect(badge.textContent?.trim()).toBe("59");
  expect(badge.className).toContain("bg-elevated text-muted");
});

it("shows no badge without a count", () => {
  const container = mountCard({ badge: "" });
  expect(headRow(container).lastElementChild?.tagName).toBe("I");
  expect(container.querySelector(".rounded-full")).toBeNull();
});
