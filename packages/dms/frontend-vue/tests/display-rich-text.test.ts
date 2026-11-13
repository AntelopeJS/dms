/** @vitest-environment jsdom */
/**
 * A rich text value is drawn from its sanitised markup: the elements and
 * attributes the sanitiser keeps reach the page, what it strips never does,
 * and the attributes the parent sets land on the same wrapper.
 */
import { computed, createApp, h } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("computed", computed);
vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));

const { default: DisplayRichText } = await import(
  "../layers/dms-ui/app/components/form/components/DisplayRichText.vue"
);

const mounted: Array<() => void> = [];

function mountRichText(
  modelValue: string,
  attributes: Record<string, string> = {},
): HTMLElement {
  const host = document.createElement("div");
  const app = createApp({
    render: () => h(DisplayRichText, { modelValue, ...attributes }),
  });
  app.mount(host);
  mounted.push(() => app.unmount());
  return host;
}

afterEach(() => {
  mounted.splice(0).forEach((unmount) => unmount());
});

describe("DisplayRichText", () => {
  it("draws the markup the sanitiser keeps, attributes and nesting included", () => {
    const host = mountRichText(
      '<h2>Title</h2><p>Read <a href="https://example.com/a?b=1&amp;c=2" title="Docs">the <strong>docs</strong></a>.<br>Next line</p><ul><li>One</li><li>Two</li></ul>',
    );

    expect(host.firstElementChild?.innerHTML).toBe(
      '<h2>Title</h2><p>Read <a href="https://example.com/a?b=1&amp;c=2" title="Docs">the <strong>docs</strong></a>.<br>Next line</p><ul><li>One</li><li>Two</li></ul>',
    );
  });

  it("drops scripts and event handlers", () => {
    const host = mountRichText(
      '<p onclick="steal()">Safe<script>steal()</script><img src="x" onerror="steal()"></p>',
    );

    expect(host.firstElementChild?.innerHTML).toBe('<p>Safe<img src="x"></p>');
  });

  it("keeps text that looks like markup as text", () => {
    const host = mountRichText("<p>1 &lt; 2 &amp;&amp; 3 &gt; 2</p>");

    expect(host.querySelector("p")?.textContent).toBe("1 < 2 && 3 > 2");
    expect(host.querySelector("p")?.children).toHaveLength(0);
  });

  it("wraps the markup in the prose container and forwards the parent's attributes to it", () => {
    const host = mountRichText("<p>Body</p>", { "data-testid": "rich" });

    const wrapper = host.firstElementChild;
    expect(wrapper?.getAttribute("data-testid")).toBe("rich");
    expect(wrapper?.classList.contains("prose")).toBe(true);
  });

  it("shows the empty placeholder for markup with no text", () => {
    const host = mountRichText("<p> </p>");

    expect(host.textContent?.trim()).toBe("dms.form.empty_value");
    expect(host.querySelector(".prose")).toBeNull();
  });
});
