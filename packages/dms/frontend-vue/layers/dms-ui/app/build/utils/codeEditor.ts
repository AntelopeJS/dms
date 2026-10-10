// The DMS code editor, built on CodeMirror: the look of the database query
// console (gutter, current line, colours, autocomplete with icons and
// details), for any form field holding code. Loaded on demand: a page only
// pays for CodeMirror once it shows a code field.
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  completionKeymap,
  startCompletion,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { sql } from "@codemirror/lang-sql";
import {
  bracketMatching,
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as placeholderText,
  tooltips,
} from "@codemirror/view";
import { CODE_PALETTE } from "./codePalette";

/** A suggestion of the autocomplete (interface-dms `CodeCompletion`). */
export interface CodeEditorCompletion {
  label: string;
  detail?: string;
  icon?: string;
}

/** Where the cursor stands, 1-based, for the status line. */
export interface CodeEditorPosition {
  line: number;
  column: number;
}

export interface CodeEditorOptions {
  parent: HTMLElement;
  value: string;
  language: string;
  lineNumbers?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  /** Attributes of the editable area: its id, aria attributes. */
  contentAttributes?: Record<string, string>;
  /** The module's suggestions, merged with the language's keywords. */
  completions?: () => Promise<CodeEditorCompletion[]>;
  /** Draws a suggestion's icon (an icon name) into the popup. */
  renderIcon?: (icon: string) => HTMLElement;
  /** The popup's footer: how to pick a suggestion and how to leave. */
  completionFooter?: string;
  onChange: (value: string) => void;
  onPosition: (position: CodeEditorPosition) => void;
}

export interface CodeEditor {
  setValue: (value: string) => void;
  setReadOnly: (readOnly: boolean) => void;
  setContentAttributes: (attributes: Record<string, string>) => void;
  focus: () => void;
  destroy: () => void;
}

const LANGUAGES: Record<string, () => Extension> = {
  json: () => json(),
  sql: () => sql(),
  html: () => html(),
  javascript: () => javascript(),
};

const HIGHLIGHT = HighlightStyle.define(CODE_PALETTE);

const THEME = EditorView.theme({
  "&": {
    backgroundColor: "var(--ui-bg)",
    color: "var(--ui-text-highlighted)",
    fontSize: "12.5px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-content": {
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    caretColor: "var(--ui-primary)",
    padding: "8px 0",
  },
  ".cm-gutters": {
    backgroundColor: "var(--dms-bg-muted, var(--ui-bg-muted))",
    color: "var(--ui-text-dimmed)",
    borderRight: "1px solid var(--ui-border)",
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
  },
  ".cm-activeLine": { backgroundColor: "var(--ui-bg-elevated)" },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--ui-bg-elevated)",
    color: "var(--ui-text-highlighted)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--ui-primary) 22%, transparent)",
  },
  ".cm-placeholder": { color: "var(--ui-text-dimmed)" },
  ".cm-tooltip.cm-tooltip-autocomplete": {
    backgroundColor: "var(--ui-bg)",
    border: "1px solid var(--ui-border-accented)",
    borderRadius: "10px",
    boxShadow: "0 12px 32px rgb(0 0 0 / 0.18)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul": { fontFamily: "inherit", padding: "4px" },
  ".cm-tooltip-autocomplete > ul > li": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "5px 8px",
    borderRadius: "6px",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--ui-bg-elevated)",
    color: "var(--ui-text-highlighted)",
  },
  ".cm-completionDetail": {
    marginLeft: "auto",
    paddingLeft: "16px",
    fontStyle: "normal",
    color: "var(--ui-text-dimmed)",
    fontSize: "11px",
  },
  ".cm-tooltip-autocomplete::after": {
    display: "block",
    padding: "6px 12px",
    borderTop: "1px solid var(--ui-border)",
    color: "var(--ui-text-dimmed)",
    fontSize: "11px",
  },
});

const MODULE_BOOST = 99;
// Where a suggestion's icon goes among the parts of its row: before the
// label (CodeMirror's own icon slot is at 20, turned off here).
const ICON_POSITION = 20;

function completionSource(
  load: () => Promise<CodeEditorCompletion[]>,
): (context: CompletionContext) => Promise<CompletionResult | null> {
  let suggestions: Promise<Completion[]> | null = null;
  return async (context) => {
    const word = context.matchBefore(/[\w.$-]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    // The module's suggestions come before the language's keywords.
    suggestions ??= load().then((items) =>
      items.map((item) => ({ ...item, type: item.icon, boost: MODULE_BOOST })),
    );
    return {
      from: word.from,
      options: await suggestions,
      validFor: /^[\w.$-]*$/,
    };
  };
}

function completionExtensions(options: CodeEditorOptions): Extension[] {
  // One source per editor: it loads the module's suggestions once.
  const source = options.completions
    ? completionSource(options.completions)
    : undefined;
  const sources = source
    ? [EditorState.languageData.of(() => [{ autocomplete: source }])]
    : [];
  const render = options.renderIcon;
  return [
    ...sources,
    // The popup goes to the page, not the editor's frame that would clip it.
    tooltips({ parent: document.body, position: "fixed" }),
    EditorView.theme({
      ".cm-tooltip-autocomplete::after": {
        content: JSON.stringify(options.completionFooter ?? ""),
      },
    }),
    autocompletion({
      icons: false,
      addToOptions: render
        ? [
            {
              position: ICON_POSITION,
              render: (completion) =>
                completion.type ? render(completion.type) : null,
            },
          ]
        : [],
    }),
    keymap.of([
      { key: "Ctrl-Space", run: startCompletion },
      ...completionKeymap,
    ]),
  ];
}

function baseExtensions(options: CodeEditorOptions): Extension[] {
  return [
    options.lineNumbers === false
      ? []
      : [lineNumbers(), highlightActiveLineGutter()],
    highlightActiveLine(),
    history(),
    bracketMatching(),
    EditorView.lineWrapping,
    syntaxHighlighting(HIGHLIGHT),
    THEME,
    LANGUAGES[options.language]?.() ?? [],
    options.placeholder ? placeholderText(options.placeholder) : [],
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
  ];
}

function positionOf(state: EditorState): CodeEditorPosition {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  return { line: line.number, column: head - line.from + 1 };
}

function stateOf(options: CodeEditorOptions, parts: Compartments): EditorState {
  return EditorState.create({
    doc: options.value,
    extensions: [
      ...baseExtensions(options),
      ...completionExtensions(options),
      parts.readOnly.of(EditorState.readOnly.of(!!options.readOnly)),
      parts.attributes.of(
        EditorView.contentAttributes.of(options.contentAttributes ?? {}),
      ),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) options.onChange(update.state.doc.toString());
        if (update.docChanged || update.selectionSet) {
          options.onPosition(positionOf(update.state));
        }
      }),
    ],
  });
}

function controlsOf(view: EditorView, parts: Compartments): CodeEditor {
  return {
    setValue: (value) => {
      if (value === view.state.doc.toString()) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    },
    setReadOnly: (readOnly) =>
      view.dispatch({
        effects: parts.readOnly.reconfigure(EditorState.readOnly.of(readOnly)),
      }),
    setContentAttributes: (attributes) =>
      view.dispatch({
        effects: parts.attributes.reconfigure(
          EditorView.contentAttributes.of(attributes),
        ),
      }),
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}

/** Mounts a code editor in `parent`. */
export function createCodeEditor(options: CodeEditorOptions): CodeEditor {
  const parts = new Compartments();
  const view = new EditorView({
    parent: options.parent,
    state: stateOf(options, parts),
  });
  options.onPosition(positionOf(view.state));
  return controlsOf(view, parts);
}

/** The parts of the editor reconfigured as the field changes. */
class Compartments {
  readonly readOnly = new Compartment();
  readonly attributes = new Compartment();
}
