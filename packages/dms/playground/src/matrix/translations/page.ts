import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { Matrix } from "@antelopejs/interface-dms/base/matrix";
import { demoGuide } from "../../table-view/guide";
import { MATRIX_API, matrixCategory } from "../category";
import {
  BASE_LANGUAGE,
  CONTESTED_KEY,
  LANGUAGE_INFO,
  LANGUAGES,
  TRANSLATION_KEYS,
} from "./data";

export const MATRIX_TRANSLATIONS_SLUG = "matrix-translations";
export const MATRIX_TRANSLATIONS_API = `${MATRIX_API}/translations`;

const PAGE_SIZE = 100;
const COLLAPSE_ABOVE = 300;

@RegisterPage()
export class PageMatrixTranslations extends PageController(
  MATRIX_TRANSLATIONS_SLUG,
  {
    displayName: "Translations (dynamic columns)",
    icon: "i-ph-translate",
    category: matrixCategory,
    order: 20,
    description:
      "A translation workspace: keys by namespace as rows, the languages as columns the route answers with their coverage. Click a cell to edit it, Enter saves and moves down, each cell saved on its own with conflict detection.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static guide = demoGuide([
    {
      label: "Look at the headers",
      text: "The block declares no column: the route answers the languages, each with a badge (Base, N missing) and a coverage meter (badge, progress).",
    },
    {
      label: "Click a French cell, type, Enter",
      text: 'editTrigger: "click", saveMode: "immediate": the cell saves on its own (Saving → Saved), Enter moves down (enterMove), Shift+Enter adds a line, Esc cancels.',
    },
    {
      label: "Fill a missing translation",
      text: "An empty cell shows the English text greyed (placeholder). N and Shift+N jump to the next and previous empty cell (jumpToEmpty), opening its group.",
    },
    {
      label: "Fix a placeholder",
      text: 'Status "Issues": translations whose placeholder does not match the base text ({nombre} for {count}) carry the warning (issues); fix it and the warning goes.',
    },
    {
      label: `Edit the French of ${CONTESTED_KEY}`,
      text: 'conflicts: "detect": a colleague rewords it right after each read, so the save answers a conflict; the cell offers Overwrite (sent again with force) or Discard.',
    },
    {
      label: "Filter, then keep editing",
      text: 'Status segments with their counts (statusFilters, counts), the namespace and language facets, the search over keys and texts. Under "Missing", a key you complete stays on screen (keepEditedRows).',
    },
    {
      label: "Scroll the 400 keys",
      text: 'pagination: "infinite", 100 keys at a time. Groups the server builds: each row names its namespace (group), the response describes them (groups: label, description, badge); collapsible, with a row count, collapsed past 300 rows (grouping: { collapsible, count, collapseAbove }).',
    },
    {
      label: "Columns and export",
      text: "Hide or reorder the languages (columnsMenu), export the rows shown as CSV (exportCsv). The footer line comes from the route.",
    },
  ]);

  static translations = Matrix({
    title: "Back-office translations",
    description: `${TRANSLATION_KEYS.length} keys in ${LANGUAGES.length} languages, ${LANGUAGE_INFO[BASE_LANGUAGE].label} the base.`,
    fetchUrl: `${MATRIX_TRANSLATIONS_API}/rows`,
    saveUrl: `${MATRIX_TRANSLATIONS_API}/save`,
    rowHeader: { label: "Key", width: 260 },
    editTrigger: "click",
    saveMode: "immediate",
    conflicts: "detect",
    enterMove: "down",
    pagination: "infinite",
    pageSize: PAGE_SIZE,
    grouping: { collapsible: true, collapseAbove: COLLAPSE_ABOVE, count: true },
    statusFilters: [
      { id: "all", label: "All" },
      { id: "missing", label: "Missing", tone: "warning" },
      { id: "complete", label: "Complete", tone: "success" },
      { id: "issues", label: "Issues", tone: "error" },
    ],
    facets: [
      {
        id: "namespace",
        label: "Namespace",
        icon: "i-ph-folder",
        multiple: true,
      },
      {
        id: "language",
        label: "Language",
        icon: "i-ph-globe",
        multiple: true,
        items: LANGUAGES.filter((language) => language !== BASE_LANGUAGE).map(
          (language) => ({
            value: language,
            label: LANGUAGE_INFO[language].label,
          }),
        ),
      },
    ],
    search: true,
    jumpToEmpty: true,
    keepEditedRows: true,
    columnsMenu: true,
    exportCsv: true,
    emptyLabel: "No key matches the search and the filters.",
    maxHeight: "75vh",
  });
}
