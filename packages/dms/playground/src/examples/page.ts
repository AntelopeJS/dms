import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import type { ComponentBuilder } from "@antelopejs/interface-dms/component";
import {
  Card,
  FieldRow,
  KeyValueList,
  NavCardGrid,
  Section,
  StatStrip,
  VStack,
} from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { examplesCategory } from "./category";
import {
  BUILDING_BLOCK_CARDS,
  CONTRIBUTE_ITEMS,
  DASHBOARD_CARDS,
  DOCS_LINKS,
  ECOSYSTEM,
  PAGE_CLASS_SAMPLE,
  RUN_LOCALLY_SAMPLE,
  RUNTIME_STEPS,
  SOURCE_MAP_ITEMS,
  USAGE_STEPS,
  type WelcomeStep,
} from "./welcome-content";

const TWO_COLUMNS = { gap: "1.5rem", minColumnWidth: "320px" };
const STACK_GAP = "1.5rem";

/** Appends one numbered field row per step to a section or a card. */
function withSteps<T>(
  container: ComponentBuilder<T>,
  steps: WelcomeStep[],
): ComponentBuilder<T> {
  return steps.reduce(
    (parent, step, index) =>
      parent.child(
        `step${index + 1}`,
        FieldRow({ ...step, label: `${index + 1}. ${step.label}` }),
      ),
    container,
  );
}

function pageClassCard() {
  return Card({
    title: "A page is a class",
    description: "The whole Users demo, declared in TypeScript.",
    actions: [
      {
        label: "Open the page",
        to: "/table-view/table-view-users",
        icon: "i-ph-arrow-right",
      },
    ],
    padded: false,
  }).child(
    "code",
    CustomComponent("PlaygroundCodeBlock").options({
      filename: "playground/src/table-view/users/page.ts",
      code: PAGE_CLASS_SAMPLE,
    }),
  );
}

function sourceMapCard() {
  return Card({
    title: "Where things live",
    description: "Paths from packages/dms.",
    actions: [
      {
        label: "Frontend layers",
        to: DOCS_LINKS.frontendLayer,
        icon: "i-ph-book-open",
      },
    ],
  }).child("map", KeyValueList({ card: false, items: SOURCE_MAP_ITEMS }));
}

function runLocallyCard() {
  return Card({
    title: "Run it locally",
    description: "Clone, install, then start the backend and the frontend.",
    actions: [
      {
        label: "Quickstart",
        to: DOCS_LINKS.quickstart,
        icon: "i-ph-book-open",
      },
    ],
    padded: false,
    footer:
      "Add a demo: create a page class under playground/src/<area>/ and export it from that area's index.ts.",
  }).child(
    "commands",
    CustomComponent("PlaygroundCodeBlock").options({
      filename: "Terminal",
      language: "shell",
      code: RUN_LOCALLY_SAMPLE,
    }),
  );
}

function contributeCard() {
  return Card({
    title: "Contribute",
    description: "Small, focused pull requests are the easiest to review.",
    footer:
      "Discuss larger changes in an issue first. Pull requests are squashed: the PR title becomes the commit on main.",
  }).child("links", KeyValueList({ card: false, items: CONTRIBUTE_ITEMS }));
}

@RegisterPage()
export class ExamplesOverviewPage extends PageController(
  "overview",
  {
    displayName: "Overview",
    icon: "i-ph-hand-waving",
    category: examplesCategory,
    order: 0,
    description:
      "Welcome to the AntelopeJS DMS playground: what it is, what to explore and how to run it",
  },
  DefaultLayout({ fullWidth: false, hideHeader: true }),
) {
  static hero = CustomComponent("PlaygroundWelcomeHero").meta({
    name: "Welcome",
    icon: "i-ph-hand-waving",
  });

  static stats = StatStrip({
    layout: "cards",
    columns: 4,
    fetchUrl: "/api/playground-welcome/stats",
  });

  static explore = NavCardGrid({
    title: "What you can explore",
    description:
      "Each area of the sidebar shows one part of the DMS. A card opens a representative demo.",
    items: BUILDING_BLOCK_CARDS,
  });

  static dashboard = NavCardGrid({
    title: "The dashboard around them",
    description:
      "What every DMS app gets without writing a page: navigation, modules and settings.",
    columns: 4,
    items: DASHBOARD_CARDS,
  });

  static usage = withSteps(
    Section({
      title: "How to use it",
      description: "A few habits that get the most out of the playground.",
    }),
    USAGE_STEPS,
  );

  static built = Section({
    title: "How it's built",
    description:
      "No page here was drawn by hand: the backend describes it, the DMS frontend renders it.",
    bare: true,
  }).child(
    "grid",
    Grid(TWO_COLUMNS).child(
      "row",
      GridRow()
        .child("pageClass", pageClassCard())
        .child(
          "aside",
          VStack({ alignment: "stretch", spacing: STACK_GAP })
            .child(
              "runtime",
              withSteps(
                Card({ title: "From class to screen", padded: false }),
                RUNTIME_STEPS,
              ),
            )
            .child("sources", sourceMapCard()),
        ),
    ),
  );

  static ecosystem = CustomComponent("PlaygroundEcosystem")
    .options(ECOSYSTEM)
    .meta({ name: "AntelopeJS ecosystem", icon: "i-ph-hexagon" });

  static contribute = Section({
    title: "Run it locally & contribute",
    description:
      "The playground is the DMS repository's own test bed: run it, add a demo, send a pull request.",
    bare: true,
  }).child(
    "grid",
    Grid(TWO_COLUMNS).child(
      "row",
      GridRow()
        .child("run", runLocallyCard())
        .child("contribute", contributeCard()),
    ),
  );
}
