import { expect } from "chai";
import { z } from "zod";
import { MCP_TOOLS } from "../../../mcp/tools";
import { sketchRefusals } from "../../../mockup/sketch";

type Sketch = { html: string } | { html: string; css: string };

const PreviewAnswer = z.object({
  ok: z.boolean(),
  error: z.object({ code: z.string() }).optional(),
});

/**
 * Sketches that link or load outside the frame: the ones the mockup compiler
 * learnt to refuse in dms#858, which the looser copy `preview_blocks` kept let
 * through, then the ones a review of the shared check found.
 */
const BYPASSES: Sketch[] = [
  { html: '<a/href="https://example.com/x">x</a>' },
  { html: "<a/href=https://example.com/x>x</a>" },
  { html: '<img/src="https://example.com/x.png">' },
  { html: '<a title="t"href="https://example.com/x">x</a>' },
  {
    html: '<svg><a/xlink:href="https://example.com/x"><text>t</text></a></svg>',
  },
  { html: '<a title=">" href="http://example.com">x</a>' },
  { html: '<a title=">" onclick=alert(1)>x</a>' },
  {
    html: "<p style=\"background:image-set('https://example.com/x' 1x)\">x</p>",
  },
  {
    html: "<style>p{background:\\75rl(http://example.com/x)}</style><p>x</p>",
  },
  { html: '<p style="background:url&#40;https://example.com/x)">x</p>' },
  {
    html: '<p style="background:image-set(&quot;https://example.com/x&quot; 1x)">x</p>',
  },
  {
    html: "<p>x</p>",
    css: 'div{background:image-set("https://example.com/x" 1x)}',
  },
  { html: "<p>x</p>", css: "div{background:image('https://example.com/x')}" },
  { html: "<p>x</p>", css: "@\\69mport 'https://example.com/x';" },
  {
    html: "<p>x</p>",
    css: 'p{background:image-set("data:image/png;base64,AAAA" 1x, "http://example.com/x.png" 2x)}',
  },
  { html: "<p>x</p>", css: "p{background:\\75rl(http://example.com/x.png)}" },
  { html: "<p>x</p>", css: 'p{background:u\\72l("http://example.com/x.png")}' },
  { html: '<a title=x"y href="https://example.com/x">x</a>' },
  { html: "<a title=x'y href='https://example.com/x'>x</a>" },
  { html: '<a x"y href="https://example.com/x">x</a>' },
  { html: '<map><area x"y href="https://example.com/x"></map>' },
  { html: '<a title=">" x"y href=https://example.com/x>x</a>' },
  {
    html: '<meta name=x"y http-equiv=refresh content="0;url=https://example.com/">',
  },
  {
    html: '<svg><a><set attributeName="href" to="https://example.com/"/><rect width=300 height=300/></a></svg>',
  },
  {
    html: '<svg><a><animate attributeName="href" values="https://example.com/" fill="freeze"/><rect width=300 height=300/></a></svg>',
  },
  {
    html: "<p>x</p>",
    css: "p{background:\\75\r\nrl(https://example.com/x.png)}",
  },
  { html: "<p>x</p>", css: "@\\69\r\nmport 'https://example.com/x';" },
  {
    html: "<p>x</p>",
    css: 'p{background:image-set("ht\\\ntps://example.com/x" 1x)}',
  },
  {
    html: "<svg><style>p{background:u&#114;l(https://example.com/x.png)}</style></svg>",
  },
  {
    html: "<svg><style>p{background:u<!---->rl(https://example.com/x.png)}</style></svg>",
  },
  { html: '<svg><rect fill="u&#114;l(https://example.com/x)"/></svg>' },
  { html: "<p>x</p>", css: 'p{background:image-set("/api/x.png" 1x)}' },
];

const STATIC_SKETCH: Sketch = {
  html: '<a href="#steps" title="see: notes">Steps</a><p style="font-family:&quot;Inter&quot;, sans-serif">a &gt; b</p><img alt="write src=x here" src="data:image/png;base64,AAAA"><p title="caf&eacute; &#8212; menu">x</p><svg viewBox="0 0 10 10"><rect fill="currentColor" width="10" height="10"/></svg>',
  css: 'p::before{content:"\\2014 Step: 1"}p{background:image-set("data:image/png;base64,AAAA" 1x)}',
};

async function previewCode(sketch: Sketch): Promise<string> {
  const previewBlocks = MCP_TOOLS.find(
    (tool) => tool.name === "preview_blocks",
  );
  if (previewBlocks === undefined) throw new Error("preview_blocks is gone");
  const result = await previewBlocks.call({ title: "Sketch", sketch });
  const answer = PreviewAnswer.parse(JSON.parse(result.content[0]?.text ?? ""));
  return answer.ok ? "ok" : (answer.error?.code ?? "unknown");
}

describe("Sketch refusals shared by the compiler and preview_blocks", () => {
  it("refuses each sketch-sanitizer bypass in sketchRefusals", () => {
    const passed = BYPASSES.filter(
      (sketch) => sketchRefusals(sketch).length === 0,
    );

    expect(passed).to.deep.equal([]);
  });

  it("refuses each sketch-sanitizer bypass in preview_blocks", async () => {
    const codes = await Promise.all(BYPASSES.map(previewCode));

    expect(codes).to.deep.equal(BYPASSES.map(() => "invalid_sketch"));
  });

  it("accepts a static sketch with data images, anchors and plain character references", async () => {
    expect(sketchRefusals(STATIC_SKETCH)).to.deep.equal([]);
    expect(await previewCode(STATIC_SKETCH)).to.equal("ok");
  });
});
