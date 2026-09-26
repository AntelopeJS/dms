import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import {
  Events,
  type ModuleExecutionContext,
  RunWithModuleContext,
} from "@antelopejs/interface-core/modules";
import { expect } from "chai";
import * as pageImpl from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as realtimeImpl from "../../../../implementations/dms/realtime";
import { ChartLine } from "@antelopejs/interface-dms/base/chart";
import * as pageInterface from "@antelopejs/interface-dms/page";
import {
  PageController,
  PageMetadata,
  pagesCategory,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as realtimeInterface from "@antelopejs/interface-dms/realtime";
import { clearPageTopics, getPageTopics } from "../../../../realtime/registry";

// Each topic a page carries is registered on its own, by the module whose page
// it is, and the core owns it from there: it releases the topic with that
// module and hands it to every new DMS generation. Nothing on the DMS side has
// to remember topics across generations.

const TOPICS_PAGE = "page-topics";
const SHARED_PAGE = "page-topics-shared";
const CHART_TOPICS = ["page-topics:first", "page-topics:second"];
const OWN_TOPIC = "page-topics:own";
const OTHER_TOPIC = "page-topics:other";

class TopicsPage extends PageController(TOPICS_PAGE, {
  displayName: "Page topics",
  category: pagesCategory,
}) {
  static trend = ChartLine({ realtimeTopic: CHART_TOPICS });
}

class SharedPage extends PageController(SHARED_PAGE, {
  displayName: "Shared page topics",
  category: pagesCategory,
}) {}

const TOPICS_PAGE_TOPICS = CHART_TOPICS;

function moduleContext(module: string): ModuleExecutionContext {
  return { module, owner: `${module}#1` };
}

function pageFullId(page: ControllerClass): string {
  return GetMetadata(page, PageMetadata).pageInfo?.fullId ?? "";
}

function topicsOf(page: ControllerClass): string[] {
  return [...getPageTopics(pageFullId(page))];
}

// What the core does when it unloads a module: the event runs in the departing
// generation's context, which names the owner whose registrations go with it.
function destroyModule(context: ModuleExecutionContext): void {
  RunWithModuleContext(context, () => {
    Events.ModuleDestroyed.emit(context.module);
  });
}

// A new DMS generation starts from empty registries and attaches its
// implementation again, which is when the core replays what it holds.
function attachNewDmsGeneration(): void {
  clearPageTopics(pageFullId(TopicsPage));
  clearPageTopics(pageFullId(SharedPage));
  ImplementInterface(realtimeInterface, realtimeImpl);
}

async function registerAs(context: ModuleExecutionContext): Promise<void> {
  const meta = GetMetadata(TopicsPage, PageMetadata);
  meta.SetComponent("trend", TopicsPage.trend);
  await RunWithModuleContext(context, () => meta.Register());
}

// A component another module places on the page: its `onCreated` runs in
// that module's context, as it does when the page registers it.
function placeChart(context: ModuleExecutionContext, topic: string): void {
  const chart = ChartLine({ realtimeTopic: topic });
  const meta = GetMetadata(SharedPage, PageMetadata);
  RunWithModuleContext(context, () => chart.onPageCreated?.(meta));
}

describe("[unit] interfaces/dms/realtime — page topics", () => {
  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(realtimeInterface, realtimeImpl);
    ImplementInterface(pageInterface, pageImpl);
  });

  it("brings every topic of a page back to a new DMS generation", async () => {
    const owner = moduleContext("page-topics-replay");
    await registerAs(owner);
    try {
      expect(topicsOf(TopicsPage)).to.have.members(TOPICS_PAGE_TOPICS);

      attachNewDmsGeneration();

      expect(topicsOf(TopicsPage)).to.have.members(TOPICS_PAGE_TOPICS);
    } finally {
      destroyModule(owner);
    }
  });

  it("gives a page's topics to the module whose page it is", async () => {
    const owner = moduleContext("page-topics-owner");
    await registerAs(owner);

    destroyModule(owner);

    expect(topicsOf(TopicsPage)).to.deep.equal([]);
    attachNewDmsGeneration();
    expect(topicsOf(TopicsPage)).to.deep.equal([]);
  });

  it("releases only the topics of the module that goes away", () => {
    const own = moduleContext("page-topics-own");
    const other = moduleContext("page-topics-other");
    placeChart(own, OWN_TOPIC);
    placeChart(other, OTHER_TOPIC);
    expect(topicsOf(SharedPage)).to.have.members([OWN_TOPIC, OTHER_TOPIC]);

    destroyModule(other);
    expect(topicsOf(SharedPage)).to.deep.equal([OWN_TOPIC]);

    attachNewDmsGeneration();
    expect(topicsOf(SharedPage)).to.deep.equal([OWN_TOPIC]);

    destroyModule(own);
    expect(topicsOf(SharedPage)).to.deep.equal([]);
  });

  it("unregisters one topic of a page by its registration id", () => {
    const pageId = pageFullId(SharedPage);
    const topics = realtimeImpl.internal.RegisterPageTopic;
    topics.register("page-topics-first-id", pageId, OWN_TOPIC);
    topics.register("page-topics-second-id", pageId, OTHER_TOPIC);

    topics.unregister("page-topics-first-id");
    expect(topicsOf(SharedPage)).to.deep.equal([OTHER_TOPIC]);

    topics.unregister("page-topics-second-id");
    expect(topicsOf(SharedPage)).to.deep.equal([]);
  });
});
