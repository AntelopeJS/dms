import { expect } from "chai";
import {
  sanitizeSvg,
  validateVariables,
} from "../../../implementations/dms-builder/engine";

const OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">';
const CLOSE = "</svg>";
const OUTSIDE = "elsewhere.test";
const PNG_DATA = "data:image/png;base64,iVBORw0KGgo=";

function svg(content: string): string {
  return `${OPEN}${content}${CLOSE}`;
}

/** Sanitize, and check that nothing of the outside reference survived. */
function expectNoOutside(content: string): string {
  const result = sanitizeSvg(svg(content));
  expect(result.svg, content).not.to.contain(OUTSIDE);
  expect(result.hadActiveContent, content).to.equal(true);
  expect(result.invalidReason, content).to.equal(undefined);
  return result.svg;
}

describe("theme SVG sanitizing", () => {
  it("takes out links to other documents on every element", () => {
    expectNoOutside(`<image href="https://${OUTSIDE}/a.png"/>`);
    expectNoOutside(`<image xlink:href="https://${OUTSIDE}/a.png"/>`);
    expectNoOutside(
      `<filter id="f"><feImage href="https://${OUTSIDE}/a.png"/></filter>`,
    );
    expectNoOutside(
      `<a href="https://${OUTSIDE}/"><rect width="1" height="1"/></a>`,
    );
    expectNoOutside(`<use href="https://${OUTSIDE}/a.svg#shape"/>`);
  });

  it("takes out the resources a style sheet fetches, and keeps its class rules", () => {
    const written = expectNoOutside(
      `<style>@import url(https://${OUTSIDE}/a.css); .st0{fill:#E30613} .st1{fill:url(https://${OUTSIDE}/p.svg#g)} .st2{background:image-set("https://${OUTSIDE}/a.png" 1x)}</style><rect class="st0"/>`,
    );
    expect(written).to.contain(".st0{fill:#E30613}");
    expect(written).not.to.contain("@import");
  });

  it("takes out outside references from presentation and style attributes", () => {
    const written = expectNoOutside(
      `<rect fill="url(https://${OUTSIDE}/f#a)" stroke="url('//${OUTSIDE}/s')" filter="url(https://${OUTSIDE}#f)" clip-path="url(https://${OUTSIDE}#c)" mask="url(https://${OUTSIDE}#m)" marker-start="url(https://${OUTSIDE}#m)" marker-end="url( 'https://${OUTSIDE}#m')" style="background:url(https://${OUTSIDE}/b);fill:red"/>`,
    );
    expect(written).to.contain('style="background:none;fill:red"');
  });

  it("drops CSS whose escapes could spell a reference", () => {
    const written = expectNoOutside(
      `<rect width="1" style="fill:u\\72l(https://${OUTSIDE}/x)"/>`,
    );
    expect(written).not.to.contain("style");
  });

  it("keeps references inside the file and embedded bitmaps, without a warning", () => {
    const result = sanitizeSvg(
      svg(
        `<style>.a{fill:url(#g)}</style><linearGradient id="g"/><rect id="r" fill="url(#g)" filter="url( '#f' )"/><use href="#r"/><use xlink:href="#r"/><a href="#r"/><image href="${PNG_DATA}"/><filter id="f"><feImage href="${PNG_DATA}"/></filter>`,
      ),
    );
    expect(result.hadActiveContent).to.equal(false);
    expect(result.svg).to.contain(".a{fill:url(#g)}");
    expect(result.svg).to.contain('fill="url(#g)"');
    expect(result.svg).to.contain('<use href="#r">');
    expect(result.svg).to.contain('<use xlink:href="#r">');
    expect(result.svg).to.contain(`<image href="${PNG_DATA}">`);
    expect(result.svg).to.contain(`<feImage href="${PNG_DATA}">`);
  });

  it("takes out an embedded document, and a bitmap anywhere but an image", () => {
    const result = sanitizeSvg(
      svg(
        `<image href="data:image/svg+xml;base64,PHN2Zy8+"/><use href="${PNG_DATA}"/>`,
      ),
    );
    expect(result.hadActiveContent).to.equal(true);
    expect(result.svg).not.to.contain("data:");
  });

  it("does not warn about what drawing tools leave in their exports", () => {
    const result = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" inkscape:version="1.3" sodipodi:docname="logo.svg"><sodipodi:namedview id="base" inkscape:zoom="0.35"/><metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></metadata><g inkscape:label="Layer 1" i:extraneous="self"><rect width="8" height="8" enable-background="new" role="img"/></g></svg>',
    );
    expect(result.hadActiveContent).to.equal(false);
    expect(result.invalidReason).to.equal(undefined);
    expect(result.svg).not.to.match(/inkscape|sodipodi/);
  });

  it("gives an SVG copied out of an HTML page the namespace a file needs", () => {
    const result = sanitizeSvg(
      '<svg viewBox="0 0 8 8"><rect width="8" height="8"/></svg>',
    );
    expect(result.invalidReason).to.equal(undefined);
    expect(result.svg).to.contain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("refuses what is no single well-formed SVG once sanitized", () => {
    const illustrator =
      '<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [<!ENTITY ns_svg "http://www.w3.org/2000/svg">]><svg version="1.1" xmlns="&ns_svg;"><rect width="8" height="8"/></svg>';
    for (const text of [
      `<html><body><p>Logo</p>${svg("<rect/>")}</body></html>`,
      `${svg("<rect/>")}${svg("<circle/>")}`,
      illustrator,
    ]) {
      expect(sanitizeSvg(text).invalidReason, text).to.be.a("string");
    }
  });
});

describe("theme variable values", () => {
  function problems(value: string): string[] {
    return validateVariables({
      shared: { "--ui-radius": value },
      light: {},
      dark: {},
    }).map((issue) => issue.message);
  }

  it("refuses a value that leaves a parenthesis, a bracket or a quote open", () => {
    for (const value of [
      "calc(1rem",
      "1rem)",
      "[a",
      "calc(1rem]",
      '"Inter',
      "'Inter, sans-serif",
    ]) {
      expect(problems(value), value).to.have.length(1);
    }
  });

  it("takes balanced values, brackets inside quotes included", () => {
    for (const value of [
      "calc(1rem + (2px * 3))",
      '"Inter (display)", sans-serif',
      "oklch(0.7 0.1 250 / 50%)",
    ]) {
      expect(problems(value), value).to.deep.equal([]);
    }
  });
});
