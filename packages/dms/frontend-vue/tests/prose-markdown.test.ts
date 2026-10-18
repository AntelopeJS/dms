import { describe, expect, it } from "vitest";
import {
  isSafeImageUrl,
  isSafeLinkUrl,
  parseProse,
  pickLocaleText,
  proseLinkKind,
  slugify,
} from "../layers/dms-ui/app/build/utils/markdown";

describe("parseProse", () => {
  it("anchors each heading once, clamped to levels 2 to 4", () => {
    const { tokens, headings } = parseProse(
      "# Getting started\n\n## Les accès\n\n### Getting started\n\n##### Deep",
    );

    expect(headings).toEqual([
      { id: "getting-started", level: 2, text: "Getting started" },
      { id: "les-acces", level: 2, text: "Les accès" },
      { id: "getting-started-2", level: 3, text: "Getting started" },
    ]);
    const deep = tokens.filter((token) => token.type === "heading").at(-1);
    expect(deep).toMatchObject({ id: "deep", level: 4 });
  });

  it("reads a heading's text without its Markdown", () => {
    const { headings } = parseProse("## The **`id`** field &amp; more");

    expect(headings[0]?.text).toBe("The id field & more");
  });

  it("turns a [!KIND] quote into a callout, its marker taken out", () => {
    const { tokens } = parseProse("> [!WARNING]\n> Back up **first**.");

    expect(tokens[0]).toMatchObject({ type: "blockquote", callout: "warning" });
    const quote = tokens[0] as { tokens: unknown[] };
    expect(JSON.stringify(quote.tokens)).not.toContain("[!WARNING]");
  });

  it("leaves a plain quote a quote", () => {
    const { tokens } = parseProse("> Just a quote");

    expect(tokens[0]).not.toHaveProperty("callout");
  });
});

describe("link and image addresses", () => {
  it.each([
    "https://example.com",
    "http://example.com",
    "mailto:ada@example.com",
    "tel:+3212345678",
    "/orders/orders-list",
    "orders",
    "#install",
    "../guide",
  ])("accepts %s as a link", (href) => {
    expect(isSafeLinkUrl(href)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "java\tscript:alert(1)",
    " javascript:alert(1)",
    "javascript&#58;alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox",
    "",
  ])("refuses %j as a link", (href) => {
    expect(isSafeLinkUrl(href)).toBe(false);
  });

  it("only takes web addresses and paths as images", () => {
    expect(isSafeImageUrl("https://cdn.example.com/a.png")).toBe(true);
    expect(isSafeImageUrl("/files/a.png")).toBe(true);
    expect(isSafeImageUrl("data:image/svg+xml,<svg/>")).toBe(false);
    expect(isSafeImageUrl("javascript:alert(1)")).toBe(false);
  });

  it("follows each kind of link its own way", () => {
    expect(proseLinkKind("/orders")).toBe("internal");
    expect(proseLinkKind("#install")).toBe("anchor");
    expect(proseLinkKind("https://example.com")).toBe("external");
    expect(proseLinkKind("mailto:ada@example.com")).toBe("contact");
    expect(proseLinkKind("javascript:alert(1)")).toBeUndefined();
  });
});

describe("slugify", () => {
  it("drops accents and joins words with dashes", () => {
    expect(slugify("  Étape 2 : l'import ")).toBe("etape-2-l-import");
  });
});

describe("pickLocaleText", () => {
  const texts = { "en-GB": "Hello", "fr-FR": "Bonjour" };

  it("reads the reader's locale, then one of the same language", () => {
    expect(pickLocaleText(texts, "fr-FR")).toBe("Bonjour");
    expect(pickLocaleText(texts, "fr-BE")).toBe("Bonjour");
  });

  it("falls back on the fallback locale, then on the first text", () => {
    expect(pickLocaleText(texts, "de-DE", "en-GB")).toBe("Hello");
    expect(pickLocaleText({ "nl-BE": "Hallo" }, "de-DE", "en-GB")).toBe(
      "Hallo",
    );
    expect(pickLocaleText({}, "de-DE")).toBe("");
  });
});
