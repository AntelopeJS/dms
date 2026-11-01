import {
  Context,
  Controller,
  Get,
  HTTPResult,
  JSONBody,
  Parameter,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  MATRIX_LONG_TEXT_LENGTH,
  type MatrixCellError,
  type MatrixCellState,
  type MatrixCellValue,
  type MatrixChange,
  type MatrixColumn,
  type MatrixConflict,
  type MatrixData,
  type MatrixGroup,
  type MatrixRow,
  type MatrixSaveRequest,
  type MatrixSaveResponse,
} from "@antelopejs/interface-dms/base/matrix-types";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { z } from "zod";
import {
  facetAllows,
  facetItems,
  type MatrixQuery,
  matchesSearch,
  pageOf,
  readMatrixQuery,
} from "../query";
import {
  cellError,
  conflictOf,
  readSaveRequest,
  rowError,
  type SaveRequest,
} from "../save";
import {
  CONTESTED_KEY,
  CONTESTED_LANGUAGE,
  CONTESTED_WORDINGS,
  MODULE_TEXTS,
  NAMESPACES,
  OVERRIDDEN_FIELD,
  OVERRIDDEN_KEYS,
  TRANSLATION_KEYS,
  type TranslationKey,
} from "./data";
import {
  BASE_LANGUAGE,
  LANGUAGE_INFO,
  LANGUAGES,
  type Language,
} from "./languages";
import { MATRIX_TRANSLATIONS_API, PageMatrixTranslations } from "./page";

const PLACEHOLDERS = /\{(\w+)\}/g;
const MAX_TEXT_LENGTH = 2000;
const WELL_COVERED = 0.9;
const PERCENT = 100;
const ALL_STATUS = "all";
const LINE_BREAK = "\n";
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const JSON_TYPE = "application/json";

/** Which keys a status segment keeps, given the languages shown. */
type StatusTest = (entry: TranslationKey, languages: Language[]) => boolean;

/** The outcome of one change: written, refused, or made on a moved value. */
interface ChangeOutcome {
  error?: MatrixCellError;
  conflict?: MatrixConflict;
}

/** What the grid shows around its rows, for one list query. */
interface TranslationView {
  languages: Language[];
  columns: MatrixColumn[];
  groups: MatrixGroup[];
  counts: StatusCounts;
  footer: string;
}

/** How many keys each status filter lists, by status id. */
interface StatusCounts {
  [status: string]: number;
}

/** A row's cells, by column id: its texts, by language, and its override flag. */
interface KeyRowValues {
  [columnId: string]: MatrixCellValue;
}

/** A translation as a cell holds it: a text, or `null` once emptied. */
const TRANSLATION_TEXT = z.string().nullable();

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

const matchesAll: StatusTest = () => true;

const STATUS_TESTS = new Map<string, StatusTest>([
  [ALL_STATUS, matchesAll],
  ["missing", hasMissing],
  [
    "complete",
    (entry, languages) =>
      !hasMissing(entry, languages) && !hasIssues(entry, languages),
  ],
  ["issues", hasIssues],
]);

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

/** A text a one-line cell cannot take whole: it is edited in the drawer. */
function isLongText(text: string): boolean {
  return text.includes(LINE_BREAK) || text.length > MATRIX_LONG_TEXT_LENGTH;
}

/**
 * An empty cell holds no value for `editIn: "auto"` to judge by: the base
 * text it translates decides where it is edited.
 */
function missingCellState(
  base: string | undefined,
): MatrixCellState | undefined {
  if (!base) return undefined;
  return isLongText(base)
    ? { placeholder: base, editIn: "panel" }
    : { placeholder: base };
}

function cellState(
  entry: TranslationKey,
  language: Language,
): MatrixCellState | undefined {
  if (isMissing(entry, language)) {
    return missingCellState(entry.texts[BASE_LANGUAGE]);
  }
  const issues = issuesOf(entry, language);
  return issues.length ? { issues, tone: "warning" } : undefined;
}

function toRow(entry: TranslationKey, languages: Language[]): MatrixRow {
  const isOverridden = OVERRIDDEN_KEYS.has(entry.key);
  const values: KeyRowValues = {
    [OVERRIDDEN_FIELD]: isOverridden,
  };
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
    badge: isOverridden ? "Overridden" : undefined,
    badgeTone: isOverridden ? "info" : undefined,
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
): StatusCounts {
  const counts: StatusCounts = {};
  for (const [status, test] of STATUS_TESTS) {
    counts[status] = entries.filter((entry) => test(entry, languages)).length;
  }
  return counts;
}

/**
 * What the grid shows around its rows for a list query: the languages'
 * columns with their coverage, the namespaces' groups, the status counts of
 * the filtered view and the footer. The read and the save answer the same.
 */
function viewOf(query: MatrixQuery): TranslationView {
  const languages = shownLanguages(query);
  return {
    languages,
    columns: languages.map(languageColumn),
    groups: NAMESPACES.map(namespaceGroup),
    counts: statusCounts(searchKeys(query), languages),
    footer: footerLine(),
  };
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
  const parsed = TRANSLATION_TEXT.safeParse(change.value);
  if (!parsed.success) return "A translation is text.";
  const value = parsed.data;
  if (value !== null && value.length > MAX_TEXT_LENGTH) {
    return `A translation holds ${MAX_TEXT_LENGTH} characters at most.`;
  }
  if (change.columnId === BASE_LANGUAGE && !value?.trim()) {
    return "The base text cannot be empty: every language translates it.";
  }
  return undefined;
}

function applyChange(
  change: MatrixChange,
  request: SaveRequest,
): ChangeOutcome {
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
  const conflict = conflictOf(request, change, entry.texts[language] ?? null);
  if (conflict) return { conflict };
  const text = TRANSLATION_TEXT.safeParse(change.value).data ?? "";
  if (text) entry.texts[language] = text;
  else delete entry.texts[language];
  OVERRIDDEN_KEYS.add(entry.key);
  return {};
}

function findKey(key: string): TranslationKey {
  const entry = TRANSLATION_KEYS.find((candidate) => candidate.key === key);
  if (entry) return entry;
  throw new HTTPResult(
    HTTP_NOT_FOUND,
    JSON.stringify({ message: `No key ${key} in this workspace.` }),
    JSON_TYPE,
  );
}

function languageNames(languages: Language[]): string {
  return languages.map((language) => LANGUAGE_INFO[language].label).join(", ");
}

/**
 * The routes of the "Translations" demo: the keys of a workspace by
 * language. The languages are columns the route answers, with their
 * coverage; the status segments, the namespace and language facets and the
 * search are applied here; the save detects conflicts on `previous` when
 * the block asks, and answers the view it moved. Two row actions copy the
 * English text into the missing languages and put the module's text back.
 */
export class MatrixTranslationsController extends Controller(
  MATRIX_TRANSLATIONS_API,
) {
  @AuthUserWithPermission(PageMatrixTranslations)
  declare user: User;

  @Get("rows")
  list(@Context() ctx: RequestContext): MatrixData {
    const query = readMatrixQuery(ctx.url.searchParams);
    const { languages, ...view } = viewOf(query);
    const test = STATUS_TESTS.get(query.status ?? ALL_STATUS) ?? matchesAll;
    const matching = searchKeys(query).filter((entry) =>
      test(entry, languages),
    );
    const data: MatrixData = {
      ...view,
      rows: pageOf(matching, query).map((entry) => toRow(entry, languages)),
      total: matching.length,
      facets: {
        namespace: facetItems(
          TRANSLATION_KEYS,
          (entry) => entry.namespace,
          Object.fromEntries(NAMESPACES.map(({ id, label }) => [id, label])),
        ),
      },
    };
    rewordContestedKey();
    return data;
  }

  @Post("save")
  save(@JSONBody() body: MatrixSaveRequest): MatrixSaveResponse {
    const request = readSaveRequest(body);
    const outcomes = request.changes.map((change) =>
      applyChange(change, request),
    );
    const rowIds = new Set(request.changes.map((change) => change.rowId));
    const { languages, ...view } = viewOf(request.query);
    return {
      ...view,
      rows: TRANSLATION_KEYS.filter((entry) => rowIds.has(entry.key)).map(
        (entry) => toRow(entry, languages),
      ),
      errors: outcomes.flatMap(({ error }) => (error ? [error] : [])),
      conflicts: outcomes.flatMap(({ conflict }) =>
        conflict ? [conflict] : [],
      ),
    };
  }

  /** Row action: the English text copied into the languages still missing. */
  @Post("actions/copy-base")
  copyBase(@Parameter("key", "query") key = "") {
    const entry = findKey(key);
    const base = entry.texts[BASE_LANGUAGE] ?? "";
    const missing = LANGUAGES.filter((language) => isMissing(entry, language));
    if (!missing.length) return { message: "Nothing was missing." };
    for (const language of missing) entry.texts[language] = base;
    OVERRIDDEN_KEYS.add(entry.key);
    return { message: `English copied into ${languageNames(missing)}.` };
  }

  /**
   * Row action: the key taken over by the workspace, its texts kept as they
   * are, so later module updates leave it alone.
   */
  @Post("actions/override")
  override(@Parameter("key", "query") key = "") {
    const entry = findKey(key);
    if (OVERRIDDEN_KEYS.has(entry.key)) {
      throw new HTTPResult(
        HTTP_CONFLICT,
        JSON.stringify({ message: "This key is already overridden." }),
        JSON_TYPE,
      );
    }
    OVERRIDDEN_KEYS.add(entry.key);
    return { message: "The workspace now overrides this key." };
  }

  /** Row action: the module's texts put back, the key no longer overridden. */
  @Post("actions/revert")
  revert(@Parameter("key", "query") key = "") {
    const entry = findKey(key);
    if (!OVERRIDDEN_KEYS.has(entry.key)) {
      throw new HTTPResult(
        HTTP_CONFLICT,
        JSON.stringify({ message: "This key already has the module's text." }),
        JSON_TYPE,
      );
    }
    entry.texts = { ...MODULE_TEXTS.get(entry.key) };
    OVERRIDDEN_KEYS.delete(entry.key);
    return { message: "The module's text is back." };
  }
}
