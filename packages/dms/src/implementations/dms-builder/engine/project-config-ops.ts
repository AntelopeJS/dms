import fs from "node:fs";
import path from "node:path";
import type {
  FileChange,
  OpResult,
  ProjectConfigOpts,
  ProjectConfigResult,
  ProjectConfigStep,
} from "@antelopejs/interface-dms-builder";
import { findConfigFile } from "./modules";
import { invalidConfig, unsupported } from "./ops";
import { type ConfigDraft, openDraft, StepRefusal } from "./project-config";
import { applyStep } from "./project-config-steps";
import { ensureEnvFileLoaded } from "./project-env-loading";
import { isScaffoldRefusal } from "./project-scaffold";
import { invalidateResourceIndex } from "./resource-index";
import { invalidateSourceIndex } from "./source-index";
import {
  diffText,
  getWritableProject,
  resetWritableProject,
  Transaction,
} from "./writable";

const ENV_EXAMPLE = ".env.example";

interface PlannedWrite {
  change: FileChange;
  content: string;
}

function plannedWrites(draft: ConfigDraft): PlannedWrite[] {
  const after = draft.file.getFullText();
  const writes: PlannedWrite[] = [
    {
      change: {
        path: draft.path,
        kind: "modify",
        diff: diffText(draft.before, after),
      },
      content: after,
    },
  ];
  for (const edit of draft.edits) {
    writes.push({
      change: {
        path: edit.path,
        kind: "modify",
        diff: diffText(edit.before, edit.content),
      },
      content: edit.content,
    });
  }
  for (const scaffold of draft.scaffolds) {
    for (const [file, content] of scaffold.files) {
      writes.push({
        change: { path: file, kind: "create", diff: diffText("", content) },
        content,
      });
    }
  }
  return writes;
}

/** `.env.example` with a line for each variable it does not mention yet, when the project has one. */
function envExampleWrite(draft: ConfigDraft): PlannedWrite | undefined {
  const file = path.join(path.dirname(draft.path), ENV_EXAMPLE);
  if (!fs.existsSync(file) || draft.variables.length === 0) {
    return undefined;
  }
  const before = fs.readFileSync(file, "utf8");
  const missing = draft.variables.filter(
    (variable) => !new RegExp(`^${variable}=`, "m").test(before),
  );
  if (missing.length === 0) {
    return undefined;
  }
  const separator = before.endsWith("\n") || before === "" ? "" : "\n";
  const content = `${before}${separator}${missing.map((variable) => `${variable}=`).join("\n")}\n`;
  return {
    change: { path: file, kind: "modify", diff: diffText(before, content) },
    content,
  };
}

type ScaffoldCheck =
  | { ok: true; transaction?: Transaction }
  | { ok: false; result: OpResult<ProjectConfigResult> };

function insideScaffold(draft: ConfigDraft, file: string): boolean {
  return draft.scaffolds.some((scaffold) =>
    file.startsWith(scaffold.root + path.sep),
  );
}

/**
 * Stages the scaffolds' entry files and typechecks them; none, when there are none. Only the new
 * modules' own files are checked: an error elsewhere in the project is not this batch's to refuse.
 */
function checkScaffolds(draft: ConfigDraft): ScaffoldCheck {
  if (draft.scaffolds.length === 0) {
    return { ok: true };
  }
  const project = getWritableProject();
  const transaction = new Transaction(project);
  for (const scaffold of draft.scaffolds) {
    transaction.track(
      project.createSourceFile(scaffold.entryFile, scaffold.entryText),
      true,
    );
  }
  const errors = transaction
    .typecheckErrors()
    .filter((error) => insideScaffold(draft, error.file));
  if (errors.length > 0) {
    transaction.rollback();
    return {
      ok: false,
      result: {
        ok: false,
        error: { code: "typecheck_failed", diagnostics: errors },
      },
    };
  }
  return { ok: true, transaction };
}

/**
 * Writes each file, then the scaffolds' entry files; when any of it fails, puts back the files
 * written before and removes the scaffolded folders, so a retry finds the project as it was.
 */
function writeAllOrNone(
  draft: ConfigDraft,
  writes: PlannedWrite[],
  transaction: Transaction | undefined,
): FileChange[] {
  const written: { path: string; before: string | undefined }[] = [];
  try {
    for (const write of writes) {
      const file = write.change.path;
      const before = fs.existsSync(file)
        ? fs.readFileSync(file, "utf8")
        : undefined;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, write.content);
      written.push({ path: file, before });
    }
    return transaction?.flush() ?? [];
  } catch (error) {
    for (const { path: file, before } of written.reverse()) {
      if (before === undefined) {
        fs.rmSync(file, { force: true });
      } else {
        fs.writeFileSync(file, before);
      }
    }
    for (const scaffold of draft.scaffolds) {
      fs.rmSync(scaffold.root, { recursive: true, force: true });
    }
    resetWritableProject();
    throw error;
  }
}

/** Writes the configuration and the other files, then the scaffolds' entry files once they typecheck. */
function commitDraft(
  draft: ConfigDraft,
  writes: PlannedWrite[],
): OpResult<ProjectConfigResult> {
  const checked = checkScaffolds(draft);
  if (!checked.ok) {
    return checked.result;
  }
  const entries = writeAllOrNone(draft, writes, checked.transaction);
  resetWritableProject();
  invalidateSourceIndex();
  invalidateResourceIndex();
  const changes = [...writes.map((write) => write.change), ...entries];
  return {
    ok: true,
    data: { files: changes.map((change) => change.path) },
    changes,
  };
}

function scaffoldEntryChanges(draft: ConfigDraft): FileChange[] {
  return draft.scaffolds.map((scaffold) => ({
    path: scaffold.entryFile,
    kind: "create",
    diff: diffText("", scaffold.entryText),
  }));
}

/**
 * Applies project-config steps as one edit of `antelope.config.ts`: every step is validated on a
 * draft first, and nothing is written when one is refused. A dry run answers the changes only.
 */
export function configureProject(
  steps: ProjectConfigStep[],
  opts: ProjectConfigOpts = {},
  sourceInterfaces?: ReadonlySet<string>,
): OpResult<ProjectConfigResult> {
  const configPath = findConfigFile();
  if (!configPath) {
    return unsupported<ProjectConfigResult>(
      "the project has no antelope.config.ts",
    );
  }
  let draft: ConfigDraft;
  try {
    draft = openDraft(configPath);
    draft.sourceInterfaces = sourceInterfaces;
    for (const step of steps) {
      applyStep(draft, step);
    }
    ensureEnvFileLoaded(draft);
  } catch (error) {
    if (error instanceof StepRefusal || isScaffoldRefusal(error)) {
      return invalidConfig<ProjectConfigResult>(error.message);
    }
    throw error;
  }
  const example = envExampleWrite(draft);
  const writes = [...plannedWrites(draft), ...(example ? [example] : [])];
  if (opts.dryRun) {
    const changes = [
      ...writes.map((write) => write.change),
      ...scaffoldEntryChanges(draft),
    ];
    return {
      ok: true,
      data: { files: changes.map((change) => change.path) },
      changes,
    };
  }
  return commitDraft(draft, writes);
}
