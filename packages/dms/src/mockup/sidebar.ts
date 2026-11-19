import type {
  MockupIssue,
  MockupSidebar,
  MockupSidebarState,
  MockupSidebarWidget,
  MockupSidebarWidgetState,
} from "./model";
import { SIDEBAR_WIDGET_DEFAULT_HEIGHT } from "./model";
import { checkSketch } from "./sketch";

/**
 * The widget the viewer draws for `widget`, under the sketch rules: markup
 * or CSS the sketch check refuses is listed at `pointer` and emitted empty,
 * so none of it reaches the frame.
 */
function compileWidget(
  widget: MockupSidebarWidget,
  pointer: string,
  issues: MockupIssue[],
): MockupSidebarWidgetState {
  const { html, css } = widget;
  const checked = checkSketch(css === undefined ? { html } : { html, css });
  if (!checked.ok) {
    for (const { field, what } of checked.refusals) {
      issues.push({
        path: `${pointer}/${field}`,
        message: `a sidebar widget is static HTML and CSS, so it may not hold ${what}`,
      });
    }
  }
  const drawn = checked.ok ? checked.sketch : { html: "" };
  const state: MockupSidebarWidgetState = {
    id: widget.id,
    html: drawn.html,
    height: widget.height ?? SIDEBAR_WIDGET_DEFAULT_HEIGHT,
  };
  if (widget.title !== undefined) state.title = widget.title;
  if (drawn.css !== undefined) state.css = drawn.css;
  return state;
}

/** The spec's sidebar widgets as the viewer draws them, with their issues. */
export function compileSidebar(
  sidebar: MockupSidebar,
  issues: MockupIssue[],
): MockupSidebarState {
  return {
    widgets: sidebar.widgets.map((widget, index) =>
      compileWidget(widget, `/sidebar/widgets/${index}`, issues),
    ),
  };
}
