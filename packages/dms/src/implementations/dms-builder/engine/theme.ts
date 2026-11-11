import fs from "node:fs";
import path from "node:path";
import type {
  MutationOpts,
  OpResult,
  OpWarning,
  ThemeDraft,
  ThemeFiles,
  ThemeLayer,
  ThemeStructure,
  ThemeVariableSets,
  TypecheckError,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import { IndentationText, Project, type SourceFile } from "ts-morph";
import { FileBatch } from "./file-batch";
import { unsupported } from "./ops";
import { contentVersion } from "./page-structure";
import { configuredIndentation, sampledIndentation } from "./project";
import {
  EMPTY_APP_CONFIG,
  readColors,
  readLogos,
  validateColors,
  validateLogos,
  writeAppConfig,
} from "./theme-app-config";
import {
  orphanedAssets,
  PUBLIC_DIRECTORY,
  type StagedLogo,
  stageLogos,
  withUploads,
} from "./theme-assets";
import { isString } from "./scalar-guards";
import { themeDraftIssues } from "./theme-draft";
import { importStylesheet, importsStylesheet } from "./theme-entry";
import type { HostedFont } from "./theme-font-catalog";
import {
  type DownloadedFontFile,
  downloadMissingFontFiles,
  fontFaceRules,
  hostedFontsOf,
  isHostedFontFace,
  orphanedFontFiles,
} from "./theme-fonts";
import {
  emptyLayersDetail,
  proposedLayerPath,
  resolveThemeLayer,
  resolveThemeRoot,
  themeFiles,
} from "./theme-layer";
import {
  emitStylesheet,
  parseStylesheet,
  validateVariables,
} from "./theme-stylesheet";

const VERSION_SEPARATOR = "\0";

/**
 * A layer's theme files as read from disk. A save edits `appConfig` and
 * `entry` in memory.
 */
interface ThemeSources {
  layer: ThemeLayer;
  files: ThemeFiles;
  /** Absolute path. */
  publicDirectory: string;
  project: Project;
  stylesheetText: string;
  appConfig: SourceFile;
  entry: SourceFile;
  version: string;
}

function readText(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
}

function layerFilePath(layer: ThemeLayer, relative: string): string {
  return path.join(layer.sourcePath, relative);
}

function versionOf(texts: Array<string | undefined>): string {
  return contentVersion(
    texts.map((text) => text ?? "").join(VERSION_SEPARATOR),
  );
}

/**
 * The indentation a formatter config or `.editorconfig` sets for the layer
 * (searched up to the git root), else the entry's own, so added lines match
 * their neighbours.
 */
function layerIndentation(
  layer: ThemeLayer,
  entryText: string,
): IndentationText {
  return (
    configuredIndentation(layer.sourcePath) ??
    sampledIndentation(entryText) ??
    IndentationText.TwoSpaces
  );
}

/**
 * The TypeScript files go in an in-memory project of their own, checked for
 * syntax only: the frontend loader compiles them, and their imports resolve
 * only in its generated workspace. `noLib` skips TypeScript's lib
 * declarations, which would add about 0.1 s to every save.
 */
function readThemeSources(layer: ThemeLayer): ThemeSources | OpResult<never> {
  const themeRoot = resolveThemeRoot(layer.sourcePath);
  if (themeRoot === undefined) {
    return unsupported<never>(emptyLayersDetail(layer.sourcePath));
  }
  const files = themeFiles(themeRoot);
  const entryPath = layerFilePath(layer, files.entryPath);
  const entryText = readText(entryPath);
  if (entryText === undefined) {
    return { ok: false, error: { code: "not_found", ref: entryPath } };
  }
  const appConfigPath = layerFilePath(layer, files.appConfigPath);
  const appConfigText = readText(appConfigPath);
  const stylesheetText = readText(layerFilePath(layer, files.stylesheetPath));
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { noLib: true },
    manipulationSettings: {
      indentationText: layerIndentation(layer, entryText),
    },
  });
  return {
    layer,
    files,
    publicDirectory: layerFilePath(
      layer,
      path.join(themeRoot, PUBLIC_DIRECTORY),
    ),
    project,
    stylesheetText: stylesheetText ?? "",
    appConfig: project.createSourceFile(
      appConfigPath,
      appConfigText ?? EMPTY_APP_CONFIG,
    ),
    entry: project.createSourceFile(entryPath, entryText),
    version: versionOf([stylesheetText, appConfigText, entryText]),
  };
}

/**
 * Without a theme layer, returns `not_found` with the path `CreateThemeLayer`
 * would create, so the editor can offer to create it.
 */
async function openThemeLayer(): Promise<ThemeSources | OpResult<never>> {
  const layer = await resolveThemeLayer();
  if (!layer) {
    return {
      ok: false,
      error: { code: "not_found", ref: proposedLayerPath() },
    };
  }
  return readThemeSources(layer);
}

/**
 * The stylesheet's variables. Its `@font-face` rules are the builder's, which
 * a save writes anew from the fonts the variables name; one written by hand
 * would be lost, so it makes the file one the builder cannot rewrite.
 */
function readVariables(
  sources: ThemeSources,
): ThemeVariableSets | OpResult<never> {
  const parsed = parseStylesheet(sources.stylesheetText);
  const opaqueReason =
    parsed.opaqueReason ??
    (parsed.fontFaces?.every(isHostedFontFace)
      ? undefined
      : "it holds an @font-face the builder did not write");
  if (parsed.variables && !opaqueReason) {
    return parsed.variables;
  }
  return unsupported<never>(
    `${sources.files.stylesheetPath} is not one the builder can rewrite: ${opaqueReason}. Move that content to another stylesheet.`,
  );
}

export async function getTheme(): Promise<OpResult<ThemeStructure>> {
  const sources = await openThemeLayer();
  if ("ok" in sources) {
    return sources;
  }
  const variables = readVariables(sources);
  if ("ok" in variables) {
    return variables;
  }
  return {
    ok: true,
    data: {
      layer: sources.layer,
      variables,
      colors: readColors(sources.appConfig),
      logos: readLogos(sources.appConfig),
      files: sources.files,
      stylesheetImported: importsStylesheet(
        sources.entry,
        sources.files.stylesheetPath,
      ),
      version: sources.version,
    },
    changes: [],
  };
}

function staleVersionError(
  sources: ThemeSources,
  opts?: MutationOpts,
): OpResult<never> | undefined {
  if (!opts?.expectedVersion || opts.expectedVersion === sources.version) {
    return undefined;
  }
  return {
    ok: false,
    error: {
      code: "stale",
      ref: layerFilePath(sources.layer, sources.files.stylesheetPath),
      currentVersion: sources.version,
    },
  };
}

function syntaxErrors(sources: ThemeSources): TypecheckError[] {
  return sources.project
    .getProgram()
    .getSyntacticDiagnostics()
    .map((diagnostic) => {
      const message = diagnostic.getMessageText();
      return {
        file: diagnostic.getSourceFile()?.getFilePath() ?? "",
        line: diagnostic.getLineNumber() ?? 0,
        message: isString(message) ? message : message.getMessageText(),
      };
    });
}

/**
 * Edits the app config (palettes, logo paths) and, when the stylesheet is not
 * empty, the entry's stylesheet import, in memory. Returns the `unsupported`
 * or `typecheck_failed` error, if any.
 */
function editSources(
  sources: ThemeSources,
  draft: ThemeDraft,
  stagedLogos: StagedLogo[],
  stylesheetText: string,
): OpResult<never> | undefined {
  const refusal = writeAppConfig(
    sources.appConfig,
    draft.colors ?? {},
    withUploads(draft.logos ?? {}, stagedLogos),
  );
  if (refusal) {
    return unsupported<never>(
      `${sources.files.appConfigPath} cannot be rewritten: ${refusal}`,
    );
  }
  if (stylesheetText !== "") {
    importStylesheet(sources.entry, sources.files.stylesheetPath);
  }
  const diagnostics = syntaxErrors(sources);
  return diagnostics.length > 0
    ? { ok: false, error: { code: "typecheck_failed", diagnostics } }
    : undefined;
}

/**
 * The stylesheet and the app config are written only when they hold
 * something or already exist, so a layer without one does not get an empty
 * one.
 */
function stageFiles(
  sources: ThemeSources,
  stagedLogos: StagedLogo[],
  fontFiles: DownloadedFontFile[],
  stylesheetText: string,
): FileBatch {
  const { layer, files } = sources;
  const batch = new FileBatch();
  const stylesheetPath = layerFilePath(layer, files.stylesheetPath);
  if (stylesheetText !== "" || fs.existsSync(stylesheetPath)) {
    batch.stageWrite(stylesheetPath, stylesheetText);
  }
  const appConfigPath = layerFilePath(layer, files.appConfigPath);
  const appConfigText = sources.appConfig.getFullText();
  if (appConfigText !== EMPTY_APP_CONFIG || fs.existsSync(appConfigPath)) {
    batch.stageWrite(appConfigPath, appConfigText);
  }
  batch.stageWrite(
    layerFilePath(layer, files.entryPath),
    sources.entry.getFullText(),
  );
  for (const logo of stagedLogos) {
    batch.stageWrite(logo.filePath, logo.bytes);
  }
  for (const file of fontFiles) {
    batch.stageWrite(file.filePath, file.bytes);
  }
  return batch;
}

function draftIssues(
  draft: ThemeDraft,
  uploadIssues: ValidationIssue[],
): ValidationIssue[] {
  return [
    ...validateVariables(draft.variables),
    ...validateColors(draft.colors ?? {}),
    ...validateLogos(draft.logos ?? {}),
    ...uploadIssues,
  ];
}

/**
 * One warning per SVG file that had active content, not one per slot: the
 * simple editor puts one file in every slot. It names the mode of the file's
 * first upload only.
 */
function sanitizedWarnings(stagedLogos: StagedLogo[]): OpWarning[] {
  const logosByFile = new Map<string, StagedLogo[]>();
  for (const logo of stagedLogos.filter((entry) => entry.hadActiveContent)) {
    logosByFile.set(logo.filePath, [
      ...(logosByFile.get(logo.filePath) ?? []),
      logo,
    ]);
  }
  return [...logosByFile.values()].map((logos) => {
    const slots = logos.map((logo) => logo.upload.slot).join(", ");
    const mode = logos[0]?.upload.mode ?? "";
    return {
      code: "svg_sanitized",
      message: `The ${mode} logo (${slots}) held scripts, event handlers or references to other files: they were taken out of the saved SVG.`,
    };
  });
}

/** What a save writes beside the draft: the logos it uploads, the fonts it hosts. */
interface ThemeAssets {
  stagedLogos: StagedLogo[];
  fonts: HostedFont[];
  fontFiles: DownloadedFontFile[];
}

function writeTheme(
  sources: ThemeSources,
  draft: ThemeDraft,
  { stagedLogos, fonts, fontFiles }: ThemeAssets,
): OpResult<{ version: string }> {
  const previousLogos = readLogos(sources.appConfig);
  const stylesheetText = emitStylesheet(draft.variables, fontFaceRules(fonts));
  const editError = editSources(sources, draft, stagedLogos, stylesheetText);
  if (editError) {
    return editError;
  }
  const batch = stageFiles(sources, stagedLogos, fontFiles, stylesheetText);
  const nextLogos = readLogos(sources.appConfig);
  for (const orphan of [
    ...orphanedAssets(sources.publicDirectory, previousLogos, nextLogos),
    ...orphanedFontFiles(fonts, sources.publicDirectory),
  ]) {
    batch.stageRemoval(orphan);
  }
  const changes = batch.flush();
  const savedSources = readThemeSources(sources.layer);
  const version = "ok" in savedSources ? "" : savedSources.version;
  const result: OpResult<{ version: string }> = {
    ok: true,
    data: { version },
    changes,
  };
  const warnings = sanitizedWarnings(stagedLogos);
  if (warnings.length > 0) {
    result.warnings = warnings;
  }
  return result;
}

function invalidConfigError(issues: ValidationIssue[]): OpResult<never> {
  return { ok: false, error: { code: "invalid_config", issues } };
}

/**
 * Writes the stylesheet, the app config's palettes and logo paths, the
 * uploaded logos, the files of the fonts the variables name and, when
 * missing, the entry's stylesheet import. Everything is checked, and every
 * font file the layer lacks downloaded, before any file is written.
 * Builder-named logo and font files the theme no longer uses are deleted,
 * except email logos.
 */
export async function setTheme(
  draft: ThemeDraft,
  opts?: MutationOpts,
): Promise<OpResult<{ version: string }>> {
  const parsedIssues = themeDraftIssues(draft);
  if (parsedIssues.length > 0) {
    return invalidConfigError(parsedIssues);
  }
  const sources = await openThemeLayer();
  if ("ok" in sources) {
    return sources;
  }
  const staleError = staleVersionError(sources, opts);
  if (staleError) {
    return staleError;
  }
  const currentVariables = readVariables(sources);
  if ("ok" in currentVariables) {
    return currentVariables;
  }
  const { stagedLogos, issues: uploadIssues } = stageLogos(
    sources.publicDirectory,
    draft.uploads ?? [],
  );
  const validationIssues = draftIssues(draft, uploadIssues);
  if (validationIssues.length > 0) {
    return invalidConfigError(validationIssues);
  }
  const fonts = hostedFontsOf(draft.variables);
  const fontFiles = await downloadMissingFontFiles(
    fonts,
    sources.publicDirectory,
  );
  if (isString(fontFiles)) {
    return unsupported<never>(fontFiles);
  }
  return writeTheme(sources, draft, { stagedLogos, fonts, fontFiles });
}
