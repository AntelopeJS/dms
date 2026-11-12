import path from "node:path";
import type { Role } from "@antelopejs/interface-dms/db";
import type { Browser, BrowserContext } from "./playwright";
import {
  closeSession,
  findRole,
  isOwnerRole,
  loadWorkspace,
  memberAccount,
  type OpenedSession,
  openSession,
  ownerAccount,
  roleOpensPage,
  type VerifyAccount,
  type Workspace,
} from "./accounts";
import { launchBrowser } from "./browser";
import { listFailures } from "./failures";
import {
  checkInteractions,
  guardWrites,
  type WriteGuard,
} from "./interactions";
import { compareWithMockup, type MockupTarget } from "./mockup";
import { probePage } from "./page-probe";
import {
  captureErrors,
  type ErrorSink,
  openPage,
  readDataBlocks,
  readLayout,
  renderAtViewport,
  type ShotStore,
} from "./render";
import type {
  DataBlock,
  PageReport,
  PageVerifyReport,
  RoleAccess,
  Viewport,
  ViewportRender,
} from "./report";
import { knownRoutes, type PageTarget, resolvePage } from "./targets";

const ESTABLISH_PATH = "/auth/establish";
const RUNS_FOLDER = [".antelope", "page-verify"];
const SUGGESTED_ROUTES = 20;

/** What `page_verify` was asked. */
export interface VerifyRequest {
  pages: string[];
  role?: string;
  viewports: readonly Viewport[];
  mockup?: MockupTarget;
  submit: boolean;
  /** The dashboard origin, such as `http://localhost:3001`. */
  origin: string;
  projectPath: string;
}

/** The browser contexts of a run and the sessions they hold, closed together. */
class Sessions {
  private readonly opened: OpenedSession[] = [];
  private readonly contexts = new Map<string, Promise<BrowserContext>>();

  constructor(
    private readonly browser: Browser,
    readonly origin: string,
  ) {}

  /** The context signed in as `account`, opened once per account. */
  contextFor(
    account: VerifyAccount,
    guard: WriteGuard,
  ): Promise<BrowserContext> {
    const key = account.user._id;
    let context = this.contexts.get(key);
    if (context === undefined) {
      context = this.signIn(account, guard);
      this.contexts.set(key, context);
    }
    return context;
  }

  private async signIn(
    account: VerifyAccount,
    guard: WriteGuard,
  ): Promise<BrowserContext> {
    const session = await openSession(account);
    this.opened.push(session);
    const context = await this.browser.newContext({
      locale: "en-US",
      colorScheme: "light",
    });
    const response = await context.request.post(
      new URL(ESTABLISH_PATH, this.origin).href,
      { data: session.ticket, headers: { origin: this.origin } },
    );
    if (!response.ok()) {
      throw new Error(
        `The dashboard at ${this.origin} refused to sign the browser in as ${account.user.email}: ${ESTABLISH_PATH} answered ${response.status()} ${await response.text()}`,
      );
    }
    await guardWrites(context, guard);
    return context;
  }

  async close(): Promise<void> {
    await Promise.allSettled(
      [...this.opened].map((session) => closeSession(session)),
    );
  }
}

interface PageRun {
  sessions: Sessions;
  workspace: Workspace;
  account: VerifyAccount;
  guard: WriteGuard;
  store: ShotStore;
}

async function observedAccess(
  run: PageRun,
  target: PageTarget,
  account: VerifyAccount,
): Promise<RoleAccess["observed"]> {
  const context = await run.sessions.contextFor(account, run.guard);
  const layout = await readLayout(
    context,
    new URL(target.layoutPath, run.sessions.origin).href,
  );
  if (layout.status === "refused") return "refused";
  const page = await context.newPage();
  try {
    await openPage(page, new URL(target.route, run.sessions.origin).href);
    return (await probePage(page)).blocks.length > 0 ? "rendered" : "refused";
  } finally {
    await page.close();
  }
}

async function roleAccess(
  run: PageRun,
  target: PageTarget,
  role: Role,
): Promise<RoleAccess> {
  const expected = (await roleOpensPage(run.workspace, role, target.info))
    ? "allowed"
    : "refused";
  const member = await memberAccount(run.workspace, role);
  if (member === undefined) {
    return {
      role: role.name,
      expected,
      observed: "not_checked",
      note: "no member holds only this role",
      ok: true,
    };
  }
  const observed = await observedAccess(run, target, member);
  return {
    role: role.name,
    expected,
    observed,
    ok: (observed === "rendered") === (expected === "allowed"),
  };
}

async function checkPermissions(
  run: PageRun,
  target: PageTarget,
): Promise<RoleAccess[]> {
  const results: RoleAccess[] = [];
  for (const role of run.workspace.roles)
    results.push(await roleAccess(run, target, role));
  return results;
}

function refusedPage(
  target: PageTarget,
  run: PageRun,
  status: number,
): PageReport {
  const failure = `the page refused ${run.account.summary.email}: its layout answered ${status}`;
  return emptyReport(target.route, target.info.fullId, [failure]);
}

function emptyReport(
  page: string,
  fullId: string | undefined,
  failures: string[],
): PageReport {
  return {
    page,
    ...(fullId !== undefined && { fullId }),
    ok: false,
    failures,
    render: { viewports: [] },
    data: [],
    errors: { console: [], failedRequests: [] },
    interactions: [],
    permissions: [],
  };
}

async function verifyPage(
  run: PageRun,
  target: PageTarget,
  request: VerifyRequest,
): Promise<PageReport> {
  const context = await run.sessions.contextFor(run.account, run.guard);
  const origin = run.sessions.origin;
  const layout = await readLayout(
    context,
    new URL(target.layoutPath, origin).href,
  );
  if (layout.status === "refused")
    return refusedPage(target, run, layout.httpStatus);
  const url = new URL(target.route, origin).href;
  const page = await context.newPage();
  const errors: ErrorSink = { viewport: "", console: [], failedRequests: [] };
  captureErrors(page, origin, errors);
  const viewports: ViewportRender[] = [];
  const data: DataBlock[] = [];
  try {
    for (const viewport of request.viewports) {
      errors.viewport = viewport.name;
      const outcome = await renderAtViewport(
        page,
        url,
        viewport,
        layout.blocks,
        run.store,
      );
      viewports.push(outcome.render);
      data.push(...readDataBlocks(outcome.probe, viewport.name));
    }
    errors.viewport = "interactions";
    const [first] = request.viewports;
    if (first)
      await page.setViewportSize({ width: first.width, height: first.height });
    const interactions = await checkInteractions(page, url, origin, run.guard);
    const mockup =
      request.mockup && first && viewports[0]
        ? await compareWithMockup(
            context,
            origin,
            request.mockup,
            viewports[0].blocks,
            {
              store: run.store,
              viewport: first,
            },
          )
        : undefined;
    const report = {
      page: target.route,
      fullId: target.info.fullId,
      render: { viewports, ...(mockup && { mockup }) },
      data,
      errors: {
        console: errors.console,
        failedRequests: errors.failedRequests,
      },
      interactions,
      permissions: await checkPermissions(run, target),
    };
    const failures = listFailures(report);
    return { ...report, ok: failures.length === 0, failures };
  } finally {
    await page.close();
  }
}

async function pickAccount(
  workspace: Workspace,
  role: string | undefined,
  notes: string[],
): Promise<VerifyAccount> {
  if (role === undefined || isOwnerRole(role)) return ownerAccount(workspace);
  const found = findRole(workspace, role);
  if (found === undefined) {
    const names =
      workspace.roles.map((known) => known.name).join(", ") || "none";
    throw new Error(
      `No role is named "${role}". Roles of the workspace: ${names}. Pass "owner" to verify as the platform owner.`,
    );
  }
  const member = await memberAccount(workspace, found);
  if (member !== undefined) return member;
  notes.push(
    `No member holds the role "${found.name}", so the pages were opened as the platform owner; invite a member with only that role to check the page as they see it. The permissions section still applies the role's grants.`,
  );
  return ownerAccount(workspace);
}

function runFolder(projectPath: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(projectPath, ...RUNS_FOLDER, stamp);
}

/**
 * Opens each page in a headless Chromium signed in as the account `role`
 * names, and reports what it renders, the data its blocks load, the errors
 * it raises, how its controls respond and which roles it opens for.
 */
export async function verifyPages(
  request: VerifyRequest,
): Promise<PageVerifyReport> {
  const notes: string[] = [];
  const workspace = await loadWorkspace();
  const account = await pickAccount(workspace, request.role, notes);
  const store: ShotStore = {
    projectPath: request.projectPath,
    dir: runFolder(request.projectPath),
  };
  const guard: WriteGuard = { submit: request.submit, blocked: [] };
  const browser = await launchBrowser();
  const sessions = new Sessions(browser, request.origin);
  const run: PageRun = { sessions, workspace, account, guard, store };
  try {
    const pages: PageReport[] = [];
    for (const name of request.pages) {
      const target = resolvePage(name);
      pages.push(
        target === undefined
          ? emptyReport(name, undefined, [
              `not a registered page route; some known routes: ${knownRoutes(SUGGESTED_ROUTES).join(", ")}`,
            ])
          : await verifyPage(run, target, request),
      );
    }
    if (guard.blocked.length > 0) {
      notes.push(
        `Writes held back (submit: false): ${[...new Set(guard.blocked)].join(", ")}`,
      );
    }
    return {
      ok: pages.every((page) => page.ok),
      dashboardUrl: request.origin,
      account: account.summary,
      screenshots: path.relative(request.projectPath, store.dir),
      notes,
      pages,
    };
  } finally {
    await browser.close();
    await sessions.close();
  }
}
