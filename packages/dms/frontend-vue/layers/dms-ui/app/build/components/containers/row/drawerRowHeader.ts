import { markRaw } from "vue";
import type { DrawerRowHeader } from "../../../../composables/containers/types";

const DRAWER_ROW_HEADING_CLASS =
  "text-[17px] leading-[1.3] font-[650] tracking-[-0.02em]";

const DRAWER_ROW_HEADER_PART = "dms-row-drawer";

/**
 * The props of `RowHeader` over a drawer: a row action's drawer and one a
 * module opens with `useDrawer({ rowHeader })` draw the same header.
 *
 * @internal
 */
export function drawerRowHeaderProps(
  header: DrawerRowHeader,
  title: string,
): Record<string, unknown> {
  return {
    part: DRAWER_ROW_HEADER_PART,
    heading: header.title ?? title,
    positionLabel: header.positionLabel,
    navigation: header.navigation,
    headingClass: header.titleClass
      ? `${DRAWER_ROW_HEADING_CLASS} ${header.titleClass}`
      : DRAWER_ROW_HEADING_CLASS,
    headingBreakAfter: header.titleBreakAfter,
    subtitle: header.subtitle,
    subtitleClass: header.subtitleClass,

    component: header.component && markRaw(header.component),
    componentOptions: header.componentOptions,
  };
}
