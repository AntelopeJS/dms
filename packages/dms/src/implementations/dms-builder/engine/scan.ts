import type {
  ConfigObject,
  PageLive,
  PagePermission,
} from "@antelopejs/interface-dms-builder";
import {
  type CallExpression,
  type ClassDeclaration,
  type Identifier,
  Node,
  type ObjectLiteralExpression,
  type Project,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import { objectLiteralToValue } from "./config-literal";
import {
  getBooleanProperty,
  getCalleeName,
  getExtendsCall,
  getIdentifierProperty,
  getNumberProperty,
  getObjectProperty,
  getStringProperty,
  stringLiteralValue,
} from "./literals";

export interface CategoryRecord {
  ref: string;
  id: string;
  fullSlug: string;
  displayName: string;
  icon?: string;
  /** Its place among its siblings in the menu, lowest first. */
  order?: number;
  parentRef?: string;
  importName?: string;
  importModule?: string;
  moduleId?: string;
}

export const DMS_PAGE_MODULE = "@antelopejs/interface-dms/page";

export interface PageRecord {
  ref: string;
  id: string;
  displayName: string;
  categoryRef: string;
  filepath: string;
  icon?: string;
  order?: number;
  description?: string;
  hidden?: boolean;
  permission?: PagePermission;
  /** The page's `live` options, when it is live and they are plain data. */
  live?: PageLive;
  moduleId?: string;
  classNode: ClassDeclaration;
  optionsNode?: ObjectLiteralExpression;
}

export interface ScanResult {
  pages: Map<string, PageRecord>;
  categories: Map<string, CategoryRecord>;
}

const RESERVED_ROOTS = new Map([
  ["pagesCategory", { id: "pages", fullSlug: "/" }],
  ["modulesCategory", { id: "modules", fullSlug: "/modules" }],
  ["settingsCategory", { id: "settings", fullSlug: "/settings" }],
]);

const CATEGORY_FACTORIES = new Set(["Category", "RootCategory"]);

export function joinSlug(parentSlug: string, urlSlug: string): string {
  const raw = parentSlug ? `${parentSlug}/${urlSlug}` : `/${urlSlug}`;
  const collapsed = raw.replace(/\/+/g, "/");
  if (collapsed !== "/" && collapsed.endsWith("/")) {
    return collapsed.slice(0, -1);
  }
  return collapsed;
}

/**
 * A page option written as an object literal: a page's `permission`, which the
 * DMS types as `Partial<Permission> | Action`, or its `live` options. Only a
 * literal is data; an `Action` or a constant reads back as absent.
 */
function readObjectOption(
  opts: ObjectLiteralExpression,
  name: string,
): ConfigObject | undefined {
  const node = getObjectProperty(opts, name);
  if (!node || !Node.isObjectLiteralExpression(node)) {
    return undefined;
  }
  const value = objectLiteralToValue(node);
  return value.fullyLiteral ? value.value : undefined;
}

class SourceScanner {
  private readonly pages = new Map<string, PageRecord>();
  private readonly categories = new Map<string, CategoryRecord>();
  private readonly byDecl = new Map<Node, CategoryRecord>();
  private readonly moduleRoots = new Map<
    string,
    { root: CategoryRecord; def?: CategoryRecord }
  >();

  constructor(private readonly project: Project) {}

  public scan(): ScanResult {
    const sourceFiles = this.project
      .getSourceFiles()
      .filter((sf) => !sf.isInNodeModules());
    for (const sourceFile of sourceFiles) {
      this.collectModules(sourceFile);
    }
    for (const sourceFile of sourceFiles) {
      this.collectCategories(sourceFile);
    }
    for (const sourceFile of sourceFiles) {
      for (const cls of sourceFile.getClasses()) {
        this.scanClass(cls);
      }
    }
    return { pages: this.pages, categories: this.categories };
  }

  private collectCategories(sourceFile: SourceFile): void {
    for (const decl of sourceFile.getVariableDeclarations()) {
      const init = decl.getInitializer();
      if (!init || !Node.isCallExpression(init)) {
        continue;
      }
      const factory = getCalleeName(init);
      if (factory && CATEGORY_FACTORIES.has(factory)) {
        this.resolveVarCategory(decl);
      }
    }
  }

  private collectModules(sourceFile: Node): void {
    for (const call of sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )) {
      if (getCalleeName(call) === "RegisterModule") {
        this.registerModule(call);
      }
    }
  }

  private registerModule(call: CallExpression): void {
    const arg = call.getArguments()[0];
    if (!arg || !Node.isObjectLiteralExpression(arg)) {
      return;
    }
    const id = getStringProperty(arg, "id");
    if (!id) {
      return;
    }
    const root: CategoryRecord = {
      ref: `modules.${id}`,
      id,
      fullSlug: `/modules/${id}`,
      displayName: getStringProperty(arg, "title") ?? id,
      parentRef: "modules",
      moduleId: id,
    };
    this.categories.set(root.ref, root);
    this.moduleRoots.set(id, { root, def: this.buildModuleDefault(arg, root) });
  }

  private buildModuleDefault(
    arg: ObjectLiteralExpression,
    root: CategoryRecord,
  ): CategoryRecord | undefined {
    const defCat = getObjectProperty(arg, "defaultCategory");
    if (!defCat || !Node.isObjectLiteralExpression(defCat)) {
      return undefined;
    }
    const urlSlug = getStringProperty(defCat, "urlSlug") ?? "pages";
    const def: CategoryRecord = {
      ref: `${root.ref}.pages`,
      id: "pages",
      fullSlug: joinSlug(root.fullSlug, urlSlug),
      displayName: getStringProperty(defCat, "displayName") ?? "pages",
      parentRef: root.ref,
      moduleId: root.moduleId,
    };
    this.categories.set(def.ref, def);
    return def;
  }

  private scanClass(cls: ClassDeclaration): void {
    const call = getExtendsCall(cls);
    if (!call || getCalleeName(call) !== "PageController") {
      return;
    }
    const [idArg, optsArg] = call.getArguments();
    const id = stringLiteralValue(idArg);
    if (!id || !optsArg || !Node.isObjectLiteralExpression(optsArg)) {
      return;
    }
    const category = this.resolvePageCategory(optsArg);
    const urlSlug = getStringProperty(optsArg, "urlSlug") ?? id;
    const ref = joinSlug(category?.fullSlug ?? "", urlSlug);
    this.pages.set(ref, {
      ref,
      id,
      displayName: getStringProperty(optsArg, "displayName") ?? id,
      categoryRef: category?.ref ?? "",
      filepath: cls.getSourceFile().getFilePath(),
      icon: getStringProperty(optsArg, "icon"),
      order: getNumberProperty(optsArg, "order"),
      description: getStringProperty(optsArg, "description"),
      hidden: getBooleanProperty(optsArg, "hidden"),
      permission: readObjectOption(optsArg, "permission"),
      live: readObjectOption(optsArg, "live"),
      moduleId: getStringProperty(optsArg, "module"),
      classNode: cls,
      optionsNode: optsArg,
    });
  }

  private resolvePageCategory(
    opts: ObjectLiteralExpression,
  ): CategoryRecord | undefined {
    const categoryId = getIdentifierProperty(opts, "category");
    if (categoryId) {
      return this.resolveCategoryRef(categoryId);
    }
    const moduleId = getStringProperty(opts, "module");
    return moduleId ? this.resolveModuleRoot(moduleId) : undefined;
  }

  private resolveModuleRoot(moduleId: string): CategoryRecord {
    const found = this.moduleRoots.get(moduleId);
    if (found) {
      return found.def ?? found.root;
    }
    const ref = `modules.${moduleId}`;
    const record: CategoryRecord = {
      ref,
      id: moduleId,
      fullSlug: `/modules/${moduleId}`,
      displayName: moduleId,
      parentRef: "modules",
    };
    this.categories.set(ref, record);
    return record;
  }

  private resolveCategoryRef(idNode: Identifier): CategoryRecord | undefined {
    const decl = idNode.getDefinitionNodes()[0];
    if (!decl) {
      return undefined;
    }
    const cached = this.byDecl.get(decl);
    if (cached) {
      return cached;
    }
    if (decl.getSourceFile().isInNodeModules()) {
      return this.resolveReserved(idNode.getText());
    }
    if (Node.isVariableDeclaration(decl)) {
      return this.resolveVarCategory(decl);
    }
    return undefined;
  }

  private resolveReserved(name: string): CategoryRecord | undefined {
    const reserved = RESERVED_ROOTS.get(name);
    if (!reserved) {
      return undefined;
    }
    const record: CategoryRecord = {
      ref: reserved.id,
      id: reserved.id,
      fullSlug: reserved.fullSlug,
      displayName: reserved.id,
      importName: name,
      importModule: DMS_PAGE_MODULE,
    };
    this.categories.set(record.ref, record);
    return record;
  }

  private resolveVarCategory(decl: Node): CategoryRecord | undefined {
    if (!Node.isVariableDeclaration(decl)) {
      return undefined;
    }
    const init = decl.getInitializer();
    if (!init || !Node.isCallExpression(init)) {
      return undefined;
    }
    const factory = getCalleeName(init);
    if (!factory || !CATEGORY_FACTORIES.has(factory)) {
      return undefined;
    }
    const [idArg, optsArg] = init.getArguments();
    const id = stringLiteralValue(idArg);
    if (!id || !optsArg || !Node.isObjectLiteralExpression(optsArg)) {
      return undefined;
    }
    return this.buildCategory(decl, id, optsArg);
  }

  private buildCategory(
    decl: Node,
    id: string,
    opts: ObjectLiteralExpression,
  ): CategoryRecord {
    const parentId = getIdentifierProperty(opts, "category");
    const parent = parentId ? this.resolveCategoryRef(parentId) : undefined;
    const urlSlug = getStringProperty(opts, "urlSlug") ?? id;
    const record: CategoryRecord = {
      ref: parent ? `${parent.ref}.${id}` : id,
      id,
      fullSlug: joinSlug(parent?.fullSlug ?? "", urlSlug),
      displayName: getStringProperty(opts, "displayName") ?? id,
      icon: getStringProperty(opts, "icon"),
      order: getNumberProperty(opts, "order"),
      parentRef: parent?.ref,
      importName: Node.isVariableDeclaration(decl) ? decl.getName() : undefined,
      importModule: decl.getSourceFile().getFilePath(),
    };
    this.byDecl.set(decl, record);
    this.categories.set(record.ref, record);
    return record;
  }
}

export function scanProject(project: Project): ScanResult {
  return new SourceScanner(project).scan();
}
