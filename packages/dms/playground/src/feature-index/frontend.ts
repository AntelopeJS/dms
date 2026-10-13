import { FEATURE_AREAS, type PlaygroundFeature } from "./types";

const AREA = FEATURE_AREAS.frontend;

const CHROME = "/dashboard-chrome";
const CUSTOM = "/custom-components";
const LABELS = "/foundations/foundations-labels";
const FEEDBACK = "/foundations/foundations-feedback";
const LISTS = "/foundations/foundations-lists";
const SURFACES = "/foundations/foundations-surfaces";
const OVERLAYS = "/foundations/foundations-overlays";
const DRAWER_MODAL = "/drawer-modal/demo";

/** A feature of this area: everything but the area itself. */
type FrontendFeature = Omit<PlaygroundFeature, "area">;

const CHROME_FEATURES: FrontendFeature[] = [
  {
    feature: "Side panel docked next to the page",
    api: "registerSidePanel({ id, component, defaultWidth, minWidth, maxWidth })",
    demo: `${CHROME}/chrome-side-panel`,
    since: "0.7.0",
  },
  {
    feature: "Side panel opened and closed from code",
    api: "useSidePanel(id).open() / close() / toggle() / isOpen",
    demo: `${CHROME}/chrome-side-panel#open-from-code`,
    since: "0.7.0",
  },
  {
    feature: "Registered side panels and their width bounds",
    api: "useAppSidePanels().panels, resolveSidePanelWidthBounds(panel)",
    demo: `${CHROME}/chrome-side-panel#open-from-code`,
    since: "0.7.0",
  },
  {
    feature: "Header button toggling a side panel",
    api: "registerHeaderAction({ sidePanelId })",
    demo: `${CHROME}/chrome-side-panel#what-to-try`,
    since: "0.7.0",
  },
  {
    feature: "Sidebar widget above or below the search button",
    api: "useSidebarWidgets().register({ component, position })",
    demo: `${CHROME}/chrome-sidebar-widgets`,
  },
  {
    feature: "Sidebar widget scoped to one module",
    api: "useSidebarWidgets().register({ module })",
    demo: `${CHROME}/chrome-sidebar-widgets#registered`,
  },
  {
    feature: "Sidebar widget adapting to the collapsed rail",
    api: "the widget's `collapsed` prop",
    demo: `${CHROME}/chrome-sidebar-widgets#registered`,
  },
  {
    feature: "Framed widgets in the bottom-left dock",
    api: "useAppWidgets().register({ id, icon, label, body, order })",
    demo: `${CHROME}/chrome-app-widgets#app-widgets`,
  },
  {
    feature: "App widget removed when it has nothing to show",
    api: "useAppWidgets().unregister(id)",
    demo: `${CHROME}/chrome-app-widgets#app-widgets`,
  },
  {
    feature: "Free overlay placed by the module on every page",
    api: "useAppOverlay().register(componentName) / unregister",
    demo: `${CHROME}/chrome-app-widgets#app-overlay`,
  },
  {
    feature: "Command palette group of the module's own entries",
    api: "registerCommandPaletteSource({ id, order, groups })",
    demo: `${CHROME}/chrome-command-palette#source`,
  },
  {
    feature: "Palette entry found by words it does not show",
    api: "item[COMMAND_PALETTE_SEARCH_TEXT_KEY]",
    demo: `${CHROME}/chrome-command-palette#source`,
  },
  {
    feature: "Palette source removed and registered again",
    api: "unregisterCommandPaletteSource(id), useCommandPaletteGroups()",
    demo: `${CHROME}/chrome-command-palette#source`,
  },
  {
    feature: "Assistant mode of the command palette",
    api: "registerCommandPaletteAssistant({ suggestions, answerComponent })",
    demo: `${CHROME}/chrome-command-palette#assistant`,
    since: "0.7.0",
  },
  {
    feature: "Assistant suggestion with its own prompt and icon",
    api: "suggestions: () => [{ label, prompt, icon }]",
    demo: `${CHROME}/chrome-command-palette#assistant`,
    since: "0.7.0",
  },
  {
    feature: "Header button that runs code, engaged and shown on demand",
    api: "registerHeaderAction({ onSelect, isActive, isVisible })",
    demo: `${CHROME}/chrome-header-actions#header-action`,
  },
  {
    feature: "Interface scale read and changed by a module",
    api: "useInterfaceScale()",
    demo: `${CHROME}/chrome-header-actions#header-action`,
  },
  {
    feature: "Button a component puts in its page header",
    api: "usePageHeaderActions(render, { order })",
    demo: `${CHROME}/chrome-header-actions#page-header-action`,
    since: "0.7.16",
  },
  {
    feature: "Link in the footer of the sign-in screens",
    api: "registerFooterLink({ id, label, to, order }), useFooterLinks()",
    demo: `${CHROME}/chrome-links`,
  },
  {
    feature: "Link under the sign-in form",
    api: "registerAuthLink({ page: 'login', label, to }), useAuthLinks(page)",
    demo: `${CHROME}/chrome-links`,
  },
  {
    feature: "Page setup function run on mount, cleaned up on leave",
    api: "PageController({ setupId }) + useDefinedFunctions().registerFunction",
    demo: `${CHROME}/chrome-page-setup`,
  },
  {
    feature: "Setup function listening to a block's events",
    api: "PageSetupContext.on(componentId, FormEvents.FIELD_CHANGE, handler)",
    demo: `${CHROME}/chrome-page-setup`,
  },
];

const COMPONENT_FEATURES: FrontendFeature[] = [
  {
    feature: "Module component placed by the backend",
    api: 'CustomComponent("Name").options(props)',
    demo: `${CUSTOM}/custom-slots`,
  },
  {
    feature: "Children rendered in a custom component's slots",
    api: ".child(id, block, { slot }) + <slot name> in the component",
    demo: `${CUSTOM}/custom-slots`,
  },
  {
    feature: "Props the DMS injects into every block",
    api: "props pageId, componentId, childCount, routeParams",
    demo: `${CUSTOM}/custom-slots`,
  },
  {
    feature: "Block id of a component nested in another block",
    api: "componentId = parent id + '-child-' + key",
    demo: `${CUSTOM}/custom-slots`,
  },
  {
    feature: "The block declared next to yours",
    api: "siblingComponentId(componentId, key)",
    demo: `${CUSTOM}/custom-block-wiring`,
    since: "0.7.9",
  },
  {
    feature: "A form's values followed from another block",
    api: "window FormEvents.FIELD_CHANGE, detail.component / data.formValues",
    demo: `${CUSTOM}/custom-block-wiring`,
  },
  {
    feature: "Record name in the breadcrumb, set by a component",
    api: "usePageRecordLabel().setLabel(path, label)",
    demo: `${CUSTOM}/custom-block-wiring`,
    since: "0.7.12",
  },
  {
    feature: "Scroll to a block by its key",
    api: "scrollToBlock(key, options)",
    demo: `${CUSTOM}/custom-block-wiring`,
    since: "0.7.12",
  },
  {
    feature: "Every data block of the page read again",
    api: "refreshPageBlocks()",
    demo: `${CUSTOM}/custom-block-wiring`,
  },
  {
    feature: "Backend call with the session's token",
    api: "useAuthFetch().$authFetch(url)",
    demo: `${CUSTOM}/custom-toolkit#auth-fetch`,
  },
  {
    feature: "Refused call shown as a translated toast",
    api: "useApiError(error)",
    demo: `${CUSTOM}/custom-toolkit#auth-fetch`,
  },
  {
    feature: "Viewer's permissions checked in a component",
    api: "usePermissions().hasPermission(id), <DmsPermissionGate>",
    demo: `${CUSTOM}/custom-toolkit#permissions`,
  },
  {
    feature: "Unsaved changes of a module's own form",
    api: "useFormDirty(values) + useUnsavedChanges({ dirty })",
    demo: `${CUSTOM}/custom-toolkit#unsaved-changes`,
  },
  {
    feature: "Required-fields legend under a form",
    api: "<DmsFormRequiredLegend />",
    demo: `${CUSTOM}/custom-toolkit#unsaved-changes`,
    since: "0.7.14",
  },
  {
    feature: "Composed text written in the reader's language",
    api: "useComposedText().processText({ key, params })",
    demo: `${CUSTOM}/custom-toolkit#composed-text`,
  },
  {
    feature: "Read-only code with a copy button",
    api: "<DmsCodeSnippet :code language title max-lines wrap />",
    demo: `${CUSTOM}/custom-toolkit#code-snippet`,
    since: "0.7.12",
  },
];

const CONTAINER_FEATURES: FrontendFeature[] = [
  {
    feature: "Drawer opened from code, from any edge",
    api: "useDrawer().open({ component, direction })",
    demo: `${DRAWER_MODAL}#drawer`,
    since: "0.7.2",
  },
  {
    feature: "Modal opened from code, in a chosen size",
    api: "useModal().open({ component, size, icon, color })",
    demo: `${DRAWER_MODAL}#modal`,
  },
  {
    feature: "Container result, updated and closed from code",
    api: "instance.result / patch({ title }) / close(value)",
    demo: `${DRAWER_MODAL}#modal`,
  },
  {
    feature: "Confirmation dialog from code",
    api: "useConfirm().confirm({ title, impact, confirmText, onConfirm })",
    demo: `${OVERLAYS}#confirm`,
  },
  {
    feature: "Node canvas with custom nodes, minimap and grid",
    api: "<DmsFlowCanvas :nodes :edges grid minimap :controls deletable-nodes>",
    demo: "/flow-canvas/demo",
  },
];

const FOUNDATION_FEATURES: FrontendFeature[] = [
  {
    feature: "Tinted icon well",
    api: "<DmsIconWell icon tone size />",
    demo: `${LABELS}#icon-well`,
  },
  {
    feature: "Status pill in any tone, with a dot or an icon",
    api: "<DmsStatusPill tone label dot variant />",
    demo: `${LABELS}#status-pill`,
  },
  {
    feature: "Eyebrow and section header",
    api: "<DmsEyebrow />, <DmsSectionHeader title description />",
    demo: `${LABELS}#section-header`,
  },
  {
    feature: "Copy button and data-driven link",
    api: "<DmsCopyButton :value />, <DmsAutoLink :to />",
    demo: `${LABELS}#copy-link`,
  },
  {
    feature: "Banner, empty state and meter",
    api: "<DmsBanner />, <DmsEmptyState />, <DmsMeter />",
    demo: `${FEEDBACK}#banner`,
  },
  {
    feature: "Check list and live password rules",
    api: "<DmsCheckList />, <DmsPasswordRules :password />",
    demo: `${FEEDBACK}#check-list`,
  },
  {
    feature: "Module health summary",
    api: "<DmsStatusSummary />",
    demo: `${FEEDBACK}#status-summary`,
  },
  {
    feature: "List rows and activity items",
    api: "<DmsListRow />, <DmsActivityItem />",
    demo: `${LISTS}#list-row`,
  },
  {
    feature: "Key / value list and stat group",
    api: "<DmsKeyValueList :items />, <DmsStatGroup :items />",
    demo: `${LISTS}#key-value-list`,
  },
  {
    feature: "Master-detail laid out from its own width",
    api: "<DmsMasterDetail />",
    demo: `${LISTS}#master-detail`,
    since: "0.7.2",
  },
  {
    feature: "Card, navigation card and segmented control",
    api: "<DmsCard />, <DmsNavCard />, <DmsSegmented v-model :items />",
    demo: `${SURFACES}#card`,
  },
  {
    feature: "Settings rows with save states and the save bar",
    api: "<DmsFieldRow />, <DmsSaveStatus />, <DmsInstantSaveBadge />, <DmsSaveBar />",
    demo: `${SURFACES}#settings-rows`,
  },
  {
    feature: "Record card with badge, tags, slots and open",
    api: "<DmsRecordCard :badge tone muted interactive @open />",
    demo: `${SURFACES}#record-card`,
  },
  {
    feature: "Settings section, card, bare or danger zone",
    api: "<DmsSection title danger :card> #badge #trail #footer",
    demo: `${SURFACES}#section`,
  },
  {
    feature: "Nuxt UI primitives in the DMS theme",
    api: "UStepper, UPagination, UPinInput, UTree, UTable…",
    demo: "/primitives/showcase",
  },
];

export const FRONTEND_FEATURES: PlaygroundFeature[] = [
  ...CHROME_FEATURES,
  ...COMPONENT_FEATURES,
  ...CONTAINER_FEATURES,
  ...FOUNDATION_FEATURES,
].map((feature) => ({ area: AREA, ...feature }));
