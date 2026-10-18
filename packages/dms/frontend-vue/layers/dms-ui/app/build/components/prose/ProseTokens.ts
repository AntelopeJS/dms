import {
  defineComponent,
  h,
  type PropType,
  resolveComponent,
  type VNodeChild,
} from "vue";
import { decodeHTML } from "entities";
import type { Token, Tokens } from "marked";
import DmsCodeSnippet from "../../../components/code-snippet/CodeSnippet.vue";
import DmsAutoLink from "../../../components/link/AutoLink.vue";
import { EXTERNAL_LINK_ATTRIBUTES } from "../../utils/link";
import {
  isSafeImageUrl,
  type ProseCalloutKind,
  type ProseCalloutToken,
  type ProseHeadingToken,
  proseLinkKind,
} from "../../utils/markdown";

// Draws the tokens `parseProse` read, element by element, with the theme's
// tokens: no HTML string is built, so nothing the Markdown says can inject
// markup. Raw HTML tokens are dropped (the text between inline tags stays),
// and a link or image whose address is refused is drawn as its text.

/** How each callout kind is drawn: its tone's frame, icon and label. */
interface CalloutLook {
  frame: string;
  title: string;
  icon: string;
}

// Literal class strings: Tailwind only extracts classes it sees whole.
const CALLOUT_LOOKS: Record<ProseCalloutKind, CalloutLook> = {
  note: {
    frame: "border-info/35 bg-info/5",
    title: "text-info",
    icon: "i-ph-info",
  },
  tip: {
    frame: "border-success/35 bg-success/5",
    title: "text-success",
    icon: "i-ph-lightbulb",
  },
  important: {
    frame: "border-primary/35 bg-primary/5",
    title: "text-primary",
    icon: "i-ph-chat-centered-text",
  },
  warning: {
    frame: "border-warning/40 bg-warning/5",
    title: "text-warning",
    icon: "i-ph-warning",
  },
  caution: {
    frame: "border-error/35 bg-error/5",
    title: "text-error",
    icon: "i-ph-warning-octagon",
  },
};

const HEADING_CLASSES: Record<ProseHeadingToken["level"], string> = {
  2: "mt-10 mb-3 text-xl font-semibold tracking-tight sm:text-[1.375rem]",
  3: "mt-8 mb-2 text-lg font-semibold tracking-tight",
  4: "mt-6 mb-2 text-base font-semibold",
};

const CLASSES = {
  paragraph: "my-4",
  heading: "group text-highlighted scroll-mt-20 first:mt-0",
  anchor:
    "text-dimmed hover:text-primary ms-2 font-normal no-underline opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
  link: "text-primary decoration-primary/40 hover:decoration-primary underline underline-offset-2",
  strong: "text-highlighted font-semibold",
  inlineCode:
    "border-default text-highlighted rounded-[5px] border bg-(--dms-bg-muted) px-1.5 py-px font-mono text-[0.875em]",
  unorderedList:
    "my-4 list-disc space-y-1.5 ps-6 marker:text-(--ui-text-dimmed)",
  orderedList:
    "my-4 list-decimal space-y-1.5 ps-6 marker:text-(--ui-text-dimmed)",
  taskList: "my-4 list-none space-y-1.5 ps-0.5",
  listItem: "ps-1 [&>p]:my-2",
  taskItem: "flex items-start gap-2.5 [&>p]:my-0",
  checkbox: "accent-primary mt-[0.45em] size-3.5 shrink-0",
  quote: "border-accented text-muted my-5 border-s-2 ps-4",
  callout: "my-5 rounded-[10px] border px-4 py-3 [&>*:last-child]:mb-0",
  calloutTitle: "mb-1 flex items-center gap-1.5 text-[13px] font-semibold",
  code: "my-5",
  tableFrame: "border-default my-5 overflow-x-auto rounded-[10px] border",
  table: "w-full border-collapse text-sm [&_tr:last-child>td]:border-b-0",
  headerCell:
    "border-default text-highlighted border-b bg-(--dms-bg-muted) px-3 py-2 text-start font-semibold",
  cell: "border-default border-b px-3 py-2 align-top",
  rule: "border-default my-8",
  figure: "my-6",
  image: "border-default mx-auto h-auto max-w-full rounded-[10px] border",
  inlineImage: "inline h-auto max-w-full align-middle",
  caption: "text-muted mt-2 text-center text-sm",
} as const;

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** One render pass: the tokens to draw and what drawing them needs. */
interface RenderContext {
  t: Translate;
  icon: ReturnType<typeof resolveComponent>;
}

/** The tokens a token nests, for the kinds that nest any. */
function childTokens(token: Token): Token[] | undefined {
  return "tokens" in token ? token.tokens : undefined;
}

function decoded(text: string): string {
  return decodeHTML(text);
}

function renderInline(
  tokens: Token[] | undefined,
  context: RenderContext,
): VNodeChild[] {
  return (tokens ?? []).map((token) => renderInlineToken(token, context));
}

const INLINE_RENDERERS: Partial<
  Record<string, (token: Token, context: RenderContext) => VNodeChild>
> = {
  strong: (token, context) =>
    h(
      "strong",
      { class: CLASSES.strong },
      renderInline(childTokens(token), context),
    ),
  em: (token, context) => h("em", renderInline(childTokens(token), context)),
  del: (token, context) =>
    h(
      "del",
      { class: "text-muted" },
      renderInline(childTokens(token), context),
    ),
  codespan: (token) =>
    h(
      "code",
      { class: CLASSES.inlineCode },
      decoded((token as Tokens.Codespan).text),
    ),
  br: () => h("br"),
  link: (token, context) => renderLink(token as Tokens.Link, context),
  image: (token) => renderImage(token as Tokens.Image, CLASSES.inlineImage),
  html: () => null,
  checkbox: () => null,
};

function renderInlineToken(token: Token, context: RenderContext): VNodeChild {
  const render = INLINE_RENDERERS[token.type];
  if (render) return render(token, context);
  const children = childTokens(token);
  if (children?.length) return renderInline(children, context);
  return "text" in token ? decoded(String(token.text)) : null;
}

function renderLink(token: Tokens.Link, context: RenderContext): VNodeChild {
  const children = renderInline(token.tokens, context);
  const kind = proseLinkKind(token.href);
  const title = token.title ? decoded(token.title) : undefined;
  if (!kind) return h("span", children);
  if (kind === "internal")
    return h(
      DmsAutoLink,
      { to: token.href, class: CLASSES.link, title },
      () => children,
    );
  const attributes = kind === "external" ? EXTERNAL_LINK_ATTRIBUTES : {};
  return h(
    "a",
    { href: token.href, class: CLASSES.link, title, ...attributes },
    children,
  );
}

function renderImage(token: Tokens.Image, className: string): VNodeChild {
  const alt = decoded(token.text);
  if (!isSafeImageUrl(token.href)) return alt;
  return h("img", {
    src: token.href,
    alt,
    title: token.title ? decoded(token.title) : undefined,
    loading: "lazy",
    decoding: "async",
    class: className,
  });
}

/** A paragraph holding one image and nothing else: drawn as a figure. */
function soleImage(token: Tokens.Paragraph): Tokens.Image | undefined {
  const parts = token.tokens.filter(
    (part) => !(part.type === "text" && !part.raw.trim()),
  );
  return parts.length === 1 && parts[0]!.type === "image"
    ? (parts[0] as Tokens.Image)
    : undefined;
}

function renderFigure(image: Tokens.Image): VNodeChild {
  const caption = image.title ? decoded(image.title) : undefined;
  return h("figure", { class: CLASSES.figure }, [
    renderImage(image, CLASSES.image),
    caption ? h("figcaption", { class: CLASSES.caption }, caption) : null,
  ]);
}

function renderHeading(
  token: ProseHeadingToken,
  context: RenderContext,
): VNodeChild {
  return h(
    `h${token.level}`,
    {
      id: token.id,
      class: [CLASSES.heading, HEADING_CLASSES[token.level]],
    },
    [
      ...renderInline(token.tokens, context),
      h(
        "a",
        {
          href: `#${token.id}`,
          class: CLASSES.anchor,
          "aria-label": context.t("dms.prose.anchor"),
        },
        "#",
      ),
    ],
  );
}

function renderList(token: Tokens.List, context: RenderContext): VNodeChild {
  const isTaskList = token.items.some((item) => item.task);
  const listClass = isTaskList
    ? CLASSES.taskList
    : token.ordered
      ? CLASSES.orderedList
      : CLASSES.unorderedList;
  const start = token.ordered && token.start !== 1 ? token.start : undefined;
  return h(
    token.ordered ? "ol" : "ul",
    { class: listClass, start: start === "" ? undefined : start },
    token.items.map((item) => renderListItem(item, context)),
  );
}

function renderListItem(
  item: Tokens.ListItem,
  context: RenderContext,
): VNodeChild {
  const content = renderBlocks(item.tokens, context);
  if (!item.task) return h("li", { class: CLASSES.listItem }, content);
  return h("li", { class: CLASSES.taskItem }, [
    h("input", {
      type: "checkbox",
      checked: item.checked,
      disabled: true,
      class: CLASSES.checkbox,
      "aria-label": context.t(
        item.checked ? "dms.prose.task_done" : "dms.prose.task_todo",
      ),
    }),
    h("div", { class: "min-w-0" }, content),
  ]);
}

function renderQuote(
  token: Tokens.Blockquote,
  context: RenderContext,
): VNodeChild {
  const kind = (token as Partial<ProseCalloutToken>).callout;
  if (!kind)
    return h(
      "blockquote",
      { class: CLASSES.quote },
      renderBlocks(token.tokens, context),
    );
  const look = CALLOUT_LOOKS[kind];
  return h(
    "aside",
    { class: [CLASSES.callout, look.frame], "data-callout": kind },
    [
      h("p", { class: [CLASSES.calloutTitle, look.title] }, [
        h(context.icon, {
          name: look.icon,
          class: "size-4",
          "aria-hidden": "true",
        }),
        context.t(`dms.prose.callout.${kind}`),
      ]),
      ...renderBlocks(token.tokens, context),
    ],
  );
}

function renderTable(token: Tokens.Table, context: RenderContext): VNodeChild {
  const cell = (data: Tokens.TableCell, tag: "th" | "td") =>
    h(
      tag,
      {
        class: tag === "th" ? CLASSES.headerCell : CLASSES.cell,
        style: data.align ? { textAlign: data.align } : undefined,
        scope: tag === "th" ? "col" : undefined,
      },
      renderInline(data.tokens, context),
    );
  return h("div", { class: CLASSES.tableFrame, tabindex: 0 }, [
    h("table", { class: CLASSES.table }, [
      h("thead", [
        h(
          "tr",
          token.header.map((data) => cell(data, "th")),
        ),
      ]),
      h(
        "tbody",
        token.rows.map((row) =>
          h(
            "tr",
            row.map((data) => cell(data, "td")),
          ),
        ),
      ),
    ]),
  ]);
}

const BLOCK_RENDERERS: Partial<
  Record<string, (token: Token, context: RenderContext) => VNodeChild>
> = {
  heading: (token, context) =>
    renderHeading(token as ProseHeadingToken, context),
  paragraph: (token, context) => {
    const image = soleImage(token as Tokens.Paragraph);
    if (image && isSafeImageUrl(image.href)) return renderFigure(image);
    return h(
      "p",
      { class: CLASSES.paragraph },
      renderInline(childTokens(token), context),
    );
  },
  list: (token, context) => renderList(token as Tokens.List, context),
  blockquote: (token, context) =>
    renderQuote(token as Tokens.Blockquote, context),
  code: (token) => {
    const code = token as Tokens.Code;
    return h("div", { class: CLASSES.code }, [
      h(DmsCodeSnippet, {
        code: code.text,
        language: code.lang?.split(/\s/)[0] || undefined,
      }),
    ]);
  },
  table: (token, context) => renderTable(token as Tokens.Table, context),
  hr: () => h("hr", { class: CLASSES.rule }),
  // A tight list item holds its text as a block-level `text` token.
  text: (token, context) =>
    childTokens(token)?.length
      ? renderInline(childTokens(token), context)
      : decoded((token as Tokens.Text).text),
  html: () => null,
  space: () => null,
  def: () => null,
  checkbox: () => null,
};

function renderBlocks(
  tokens: Token[] | undefined,
  context: RenderContext,
): VNodeChild[] {
  return (tokens ?? []).map((token) => {
    const render = BLOCK_RENDERERS[token.type];
    return render ? render(token, context) : renderInlineToken(token, context);
  });
}

/** Draws the tokens of a parsed Markdown text (`parseProse`). */
export default defineComponent({
  name: "DmsProseTokens",
  props: {
    tokens: { type: Array as PropType<Token[]>, required: true },
  },
  setup(props) {
    const { t } = useI18n();
    return () =>
      renderBlocks(props.tokens, {
        t: t as Translate,
        icon: resolveComponent("UIcon"),
      });
  },
});
