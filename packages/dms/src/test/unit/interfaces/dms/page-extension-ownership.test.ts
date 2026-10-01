import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import {
  GetModuleContext,
  ReloadModule,
} from "@antelopejs/interface-core/modules";
import { expect } from "chai";
import * as pageImpl from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as realtimeImpl from "../../../../implementations/dms/realtime";
import { ChartLine } from "@antelopejs/interface-dms/base/chart";
import {
  PageController,
  PageMetadata,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as realtimeInterface from "@antelopejs/interface-dms/realtime";
import { clearPageTopics, getPageTopics } from "../../../../realtime/registry";
import {
  liveReloadHostOwner,
  RELOAD_HOST_EXTENSION_KEY,
  RELOAD_HOST_EXTENSION_TOPIC,
  RELOAD_HOST_MODULE,
  setReloadHostExtendedPages,
} from "../../../helpers/reload-host";

// The reload-host module injects a chart into pages this suite registers.
// Preparing it registers a permission and a realtime topic, and both belong to
// reload-host whichever module runs the sync that prepares them: the DMS when
// the extension registers after its page, the page's module when the page
// registers (or registers again) after the extension, a new DMS generation
// when it applies the extension again.

const PAGE_TOPIC = "pe-ownership:page";
const OWN_KEY = "trend";
const AFTER_PAGE = "pe-ownership-after";
const BEFORE_PAGE = "pe-ownership-before";

interface RegisteredEntry {
  owner?: string;
}

interface InspectableProxy {
  state: { registered: Map<string, RegisteredEntry> };
}

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function pageId(page: string): string {
  return `pages.${page}`;
}

function ownerOf(proxy: unknown, id: string): string | undefined {
  return (proxy as InspectableProxy).state.registered.get(id)?.owner;
}

function permissionOwner(id: string): string | undefined {
  return ownerOf(permissionsInterface.internal.RegisterPermission, id);
}

function topicOwner(page: string, topic: string): string | undefined {
  return ownerOf(
    realtimeInterface.internal.RegisterPageTopic,
    JSON.stringify([pageId(page), topic]),
  );
}

function extensionPermission(page: string): string {
  return `${pageId(page)}.${RELOAD_HOST_EXTENSION_KEY}`;
}

function definePage(id: string): ControllerClass {
  return class extends PageController(id, {
    displayName: `Extension ownership ${id}`,
    category: pagesCategory,
  }) {
    static [OWN_KEY] = ChartLine({ realtimeTopic: PAGE_TOPIC });
  };
}

async function registerPage(id: string): Promise<ControllerClass> {
  const page = definePage(id);
  RegisterPage()(page);
  await settle();
  await settle();
  return page;
}

async function reloadExtendingModule(pages: string[]): Promise<void> {
  setReloadHostExtendedPages(pages.map(pageId));
  await ReloadModule(RELOAD_HOST_MODULE);
  await settle();
  await settle();
}

// A new DMS generation starts from empty registries and attaches its
// implementations again, which is when the core replays what it holds -- only
// what no DMS generation owns: a real reload releases the rest.
function attachNewDmsGeneration(): void {
  clearPageTopics(pageId(AFTER_PAGE));
  clearPageTopics(pageId(BEFORE_PAGE));
  ImplementInterface(permissionsInterface, permissionsImpl);
  ImplementInterface(realtimeInterface, realtimeImpl);
}

function expectOwnedByExtendingModule(page: string): void {
  const owner = liveReloadHostOwner();
  expect(owner).to.be.a("string");
  // The suite runs as the DMS module: an owner equal to its own is the bug.
  expect(owner).to.not.equal(GetModuleContext()?.owner);
  expect(permissionOwner(extensionPermission(page))).to.equal(owner);
  expect(topicOwner(page, RELOAD_HOST_EXTENSION_TOPIC)).to.equal(owner);
}

describe("[unit] interfaces/dms/page — page extension ownership", () => {
  let pageOwner: string | undefined;
  let beforeTarget: ControllerClass;

  before(async () => {
    await registerPage(AFTER_PAGE);
    pageOwner = topicOwner(AFTER_PAGE, PAGE_TOPIC);
    await reloadExtendingModule([AFTER_PAGE, BEFORE_PAGE]);
    beforeTarget = await registerPage(BEFORE_PAGE);
  });

  after(() => {
    setReloadHostExtendedPages([]);
  });

  it("gives an extension registered after its page to the extending module", () => {
    expectOwnedByExtendingModule(AFTER_PAGE);
    expect(pageOwner).to.be.a("string");
    expect(pageOwner).to.not.equal(liveReloadHostOwner());
    expect(permissionOwner(`${pageId(AFTER_PAGE)}.${OWN_KEY}`)).to.equal(
      pageOwner,
    );
  });

  it("gives an extension registered before its page to the extending module", () => {
    expectOwnedByExtendingModule(BEFORE_PAGE);
    expect(topicOwner(BEFORE_PAGE, PAGE_TOPIC)).to.equal(pageOwner);
  });

  it("keeps an extension with its module when the target page registers again", async () => {
    // A hot reload of the page's module: the page comes back under a new
    // class, and the extension is prepared again for it.
    const pageInfo = GetMetadata(beforeTarget, PageMetadata).pageInfo;
    pageImpl.internal.RegisterPage.unregister(
      pageInfo as NonNullable<typeof pageInfo>,
    );
    expect(permissionOwner(extensionPermission(BEFORE_PAGE))).to.equal(
      undefined,
    );
    beforeTarget = await registerPage(BEFORE_PAGE);

    expectOwnedByExtendingModule(BEFORE_PAGE);
  });

  it("brings an extension's topic and permission back to a new DMS generation", async () => {
    attachNewDmsGeneration();

    expect([...getPageTopics(pageId(AFTER_PAGE))]).to.have.members([
      PAGE_TOPIC,
      RELOAD_HOST_EXTENSION_TOPIC,
    ]);
    expectOwnedByExtendingModule(AFTER_PAGE);
    expect(
      permissionsImpl.GetPermission(extensionPermission(AFTER_PAGE)),
    ).to.not.equal(undefined);
  });

  it("releases an extension's topic and permission with the extending module", async () => {
    await reloadExtendingModule([]);

    for (const page of [AFTER_PAGE, BEFORE_PAGE]) {
      expect(permissionOwner(extensionPermission(page))).to.equal(undefined);
      expect(permissionsImpl.GetPermission(extensionPermission(page))).to.equal(
        undefined,
      );
      expect(topicOwner(page, RELOAD_HOST_EXTENSION_TOPIC)).to.equal(undefined);
      expect([...getPageTopics(pageId(page))]).to.deep.equal([PAGE_TOPIC]);
      expect(permissionOwner(`${pageId(page)}.${OWN_KEY}`)).to.equal(pageOwner);
    }
  });
});
