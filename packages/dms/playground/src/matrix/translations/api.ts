import {
  Context,
  Controller,
  Get,
  JSONBody,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type {
  MatrixCellError,
  MatrixCellState,
  MatrixChange,
  MatrixColumn,
  MatrixConflict,
  MatrixData,
  MatrixGroup,
  MatrixRow,
  MatrixSaveRequest,
  MatrixSaveResponse,
} from "@antelopejs/interface-dms/base/matrix";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import {
  facetAllows,
  facetItems,
  type MatrixQuery,
  matchesSearch,
  pageOf,
  readMatrixQuery,
} from "../query";
import { cellError, readSaveRequest, rowError, sameCellValue } from "../save";
import {
  BASE_LANGUAGE,
  CONTESTED_KEY,
  CONTESTED_LANGUAGE,
  CONTESTED_WORDINGS,
  LANGUAGE_INFO,
  LANGUAGES,
  type Language,
  NAMESPACES,
  TRANSLATION_KEYS,
  type TranslationKey,
} from "./data";
import { MATRIX_TRANSLATIONS_API, PageMatrixTranslations } from "./page";

const PLACEHOLDERS = /\{(\w+)\}/g;
const MAX_TEXT_LENGTH = 500;
const WELL_COVERED = 0.9;
const PERCENT = 100;
const ALL_STATUS = "all";

/** Which keys a status segment keeps, given the languages shown. */
type StatusTest = (entry: TranslationKey, languages: Language[]) => boolean;

/** The outcome of one change: written, refused, or made on a moved value. */
interface ChangeOutcome {
  error?: MatrixCellError;
  conflict?: MatrixConflict;
}

let contestedWording = 0;

function placeholdersOf(text: string): Set<string> {
  return new Set(Array.from(text.matchAll(PLACEHOLDERS), (match) => match[1]!));
}

/** The placeholder mistakes of a translation against its base text. */
function issuesOf(entry: TranslationKey, language: Language): string[] {
  const base = entry.texts[BASE_LANGUAGE];
  const text = entry.texts[language];
  if (language === BASE_LANGUAGE || !base || !text) return [];
  const expected = placeholdersOf(base);
  const found = placeholdersOf(text);
  const missing = [...expected].filter((name) => !found.has(name));
  const unknown = [...found].filter((name) => !expected.has(name));
  return [
    ...missing.map((name) => `Placeholder {${name}} is missing`),
    ...unknown.map(
      (name) =>
        `Unknown placeholder {${name}}: the base text has no such value`,
    ),
  ];
}

const isMissing = (entry: TranslationKey, language: Language) =>
  !entry.texts[language];

const hasIssues: StatusTest = (entry, languages) =>
  languages.some((language) => issuesOf(entry, language).length > 0);

const hasMissing: StatusTest = (entry, languages) =>
  languages.some((language) => isMissing(entry, language));

const STATUS_TESTS: Record<string, StatusTest> = {
  all: () => true,
  missing: hasMissing,
  complete: (entry, languages) =>
    !hasMissing(entry, languages) && !hasIssues(entry, languages),
  issues: hasIssues,
};

function isLanguage(id: string): id is Language {
  return LANGUAGES.some((language) => language === id);
}

/** The base language, then the ones the language facet keeps. */
function shownLanguages(query: MatrixQuery): Language[] {
  return LANGUAGES.filter(
    (language) =>
      language === BASE_LANGUAGE || facetAllows(query, "language", language),
  );
}

function missingCount(language: Language): number {
  return TRANSLATION_KEYS.filter((entry) => isMissing(entry, language)).length;
}

function coverage(language: Language): number {
  return 1 - missingCount(language) / TRANSLATION_KEYS.length;
}

function languageColumn(language: Language): MatrixColumn {
  const { label, locale } = LANGUAGE_INFO[language];
  const column: MatrixColumn = {
    id: language,
    label,
    description: locale,
    kind: "longText",
    width: 300,
  };
  if (language === BASE_LANGUAGE) {
    return { ...column, badge: "Base", badgeTone: "primary", required: true };
  }
  const missing = missingCount(language);
  const covered = coverage(language);
  return {
    ...column,
    badge: missing ? `${missing} missing` : "Complete",
    badgeTone: missing ? "warning" : "success",
    progress: covered,
    progressTone: covered >= WELL_COVERED ? "success" : "warning",
  };
}

function namespaceGroup(namespace: (typeof NAMESPACES)[number]): MatrixGroup {
  const missing = TRANSLATION_KEYS.filter(
    (entry) =>
      entry.namespace === namespace.id && hasMissing(entry, [...LANGUAGES]),
  ).length;
  return {
    id: namespace.id,
    label: namespace.label,
    description: namespace.description,
    badge: missing ? `${missing} incomplete` : "Complete",
    badgeTone: missing ? "warning" : "success",
  };
}

function cellState(
  entry: TranslationKey,
  language: Language,
): MatrixCellState | undefined {
  const base = entry.texts[BASE_LANGUAGE];
  if (isMissing(entry, language))
    return base ? { placeholder: base } : undefined;
  const issues = issuesOf(entry, language);
  return issues.length ? { issues, tone: "warning" } : undefined;
}

function toRow(entry: TranslationKey, languages: Language[]): MatrixRow {
  const values: Record<string, string | null> = {};
  const cells: Record<string, MatrixCellState> = {};
  for (const language of languages) {
    values[language] = entry.texts[language] ?? null;
    const state = cellState(entry, language);
    if (state) cells[language] = state;
  }
  return {
    id: entry.key,
    label: entry.key.slice(entry.namespace.length + 1),
    group: entry.namespace,
    values,
    cells,
  };
}

function percentOf(language: Language): string {
  return `${LANGUAGE_INFO[language].label} ${Math.floor(coverage(language) * PERCENT)} %`;
}

function footerLine(): string {
  const translated = LANGUAGES.filter((language) => language !== BASE_LANGUAGE);
  const missing = translated.reduce(
    (sum, language) => sum + missingCount(language),
    0,
  );
  const withIssues = TRANSLATION_KEYS.filter((entry) =>
    hasIssues(entry, translated),
  ).length;
  return `Coverage: ${translated.map(percentOf).join(" · ")}. ${missing} translations missing, ${withIssues} keys with a placeholder issue.`;
}

function searchKeys(query: MatrixQuery): TranslationKey[] {
  return TRANSLATION_KEYS.filter(
    (entry) =>
      facetAllows(query, "namespace", entry.namespace) &&
      matchesSearch(query.search, [entry.key, ...Object.values(entry.texts)]),
  );
}

function statusCounts(
  entries: TranslationKey[],
  languages: Language[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [status, test] of Object.entries(STATUS_TESTS)) {
    counts[status] = entries.filter((entry) => test(entry, languages)).length;
  }
  return counts;
}

/** A colleague rewords the contested key right after each read. */
function rewordContestedKey(): void {
  const entry = TRANSLATION_KEYS.find(
    (candidate) => candidate.key === CONTESTED_KEY,
  );
  if (!entry) return;
  contestedWording = (contestedWording + 1) % CONTESTED_WORDINGS.length;
  entry.texts[CONTESTED_LANGUAGE] = CONTESTED_WORDINGS[contestedWording];
}

function checkValue(change: MatrixChange): string | undefined {
  const { value } = change;
  if (value !== null && typeof value !== "string")
    return "A translation is text.";
  if (typeof value === "string" && value.length > MAX_TEXT_LENGTH) {
    return `A translation holds ${MAX_TEXT_LENGTH} characters at most.`;
  }
  if (change.columnId === BASE_LANGUAGE && !value?.trim()) {
    return "The base text cannot be empty: every language translates it.";
  }
  return undefined;
}

function applyChange(change: MatrixChange, force: boolean): ChangeOutcome {
  const entry = TRANSLATION_KEYS.find(
    (candidate) => candidate.key === change.rowId,
  );
  if (!entry) return { error: rowError(change.rowId, "This key was deleted.") };
  const language = change.columnId;
  if (!isLanguage(language)) {
    return {
      error: cellError(
        change,
        `${language} is not a language of this workspace.`,
      ),
    };
  }
  const problem = checkValue(change);
  if (problem) return { error: cellError(change, problem) };
  const current = entry.texts[language] ?? null;
  if (!force && !sameCellValue(change.previous, current)) {
    return { conflict: { rowId: change.rowId, columnId: language, current } };
  }
  const text = typeof change.value === "string" ? change.value : "";
  if (text) entry.texts[language] = text;
  else delete entry.texts[language];
  return {};
}

/**
 * The routes of the "Translations" demo: the keys of a workspace by
 * language. The languages are columns the route answers, with their
 * coverage; the status segments, the namespace and language facets and the
 * search are applied here, and the save detects conflicts on `previous`.
 */
export class MatrixTranslationsController extends Controller(
  MATRIX_TRANSLATIONS_API,
) {
  @AuthUserWithPermission(PageMatrixTranslations)
  declare user: User;

  @Get("rows")
  list(@Context() ctx: RequestContext): MatrixData {
    const query = readMatrixQuery(ctx.url.searchParams);
    const languages = shownLanguages(query);
    const searched = searchKeys(query);
    const test =
      STATUS_TESTS[query.status ?? ALL_STATUS] ?? STATUS_TESTS[ALL_STATUS]!;
    const matching = searched.filter((entry) => test(entry, languages));
    const data: MatrixData = {
      rows: pageOf(matching, query).map((entry) => toRow(entry, languages)),
      columns: languages.map(languageColumn),
      total: matching.length,
      groups: NAMESPACES.map(namespaceGroup),
      counts: statusCounts(searched, languages),
      facets: {
        namespace: facetItems(
          TRANSLATION_KEYS,
          (entry) => entry.namespace,
          Object.fromEntries(NAMESPACES.map(({ id, label }) => [id, label])),
        ),
      },
      footer: footerLine(),
    };
    rewordContestedKey();
    return data;
  }

  @Post("save")
  save(@JSONBody() body: MatrixSaveRequest): MatrixSaveResponse {
    const { changes, force = false } = readSaveRequest(body);
    const outcomes = changes.map((change) => applyChange(change, force));
    const rowIds = new Set(changes.map((change) => change.rowId));
    return {
      rows: TRANSLATION_KEYS.filter((entry) => rowIds.has(entry.key)).map(
        (entry) => toRow(entry, [...LANGUAGES]),
      ),
      errors: outcomes.flatMap(({ error }) => (error ? [error] : [])),
      conflicts: outcomes.flatMap(({ conflict }) =>
        conflict ? [conflict] : [],
      ),
    };
  }
}
