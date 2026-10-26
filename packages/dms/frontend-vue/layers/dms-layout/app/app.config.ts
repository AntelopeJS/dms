import type {
  DmsBrandingLogo,
  DmsUiColors,
} from "#dms-core/shared/types/app-config";
import { EYEBROW_CLASS } from "#dms-ui/app/build/utils/eyebrow";
import { actionsTheme } from "./theme/actions";
import { dataTheme } from "./theme/data";
import { formControlsTheme } from "./theme/form-controls";
import {
  NAVIGATION_MENU_HORIZONTAL_COMPOUNDS,
  navigationTheme,
} from "./theme/navigation";
import { surfacesTheme } from "./theme/surfaces";

const ANTELOPE_ICON = "/images/antelope-logo/icon.svg";

function dmsColors(): DmsUiColors {
  return {
    primary: "dms",

    secondary: "violet",
    neutral: "neutral",

    success: "emerald",
    warning: "amber",
    error: "red",
    info: "cyan",
  };
}

function dmsLogo(): DmsBrandingLogo {
  return {
    default: {
      light: "/images/antelope-logo/light.svg",
      dark: "/images/antelope-logo/dark.svg",
    },
    collapsed: { light: ANTELOPE_ICON, dark: ANTELOPE_ICON },
    favicon: { light: ANTELOPE_ICON, dark: ANTELOPE_ICON },
  };
}

export default {
  ui: {
    colors: dmsColors(),
    icons: {
      arrowDown: "i-ph-arrow-down-light",
      arrowLeft: "i-ph-arrow-left-light",
      arrowRight: "i-ph-arrow-right-light",
      arrowUp: "i-ph-arrow-up-light",
      check: "i-ph-check-light",
      chevronDoubleLeft: "i-ph-caret-double-left-light",
      chevronDoubleRight: "i-ph-caret-double-right-light",
      chevronDown: "i-ph-caret-down-light",
      chevronLeft: "i-ph-caret-left-light",
      chevronRight: "i-ph-caret-right-light",
      chevronUp: "i-ph-caret-up-light",
      close: "i-ph-x-light",
      ellipsis: "i-ph-dots-three-light",
      external: "i-ph-arrow-up-right-light",
      menu: "i-ph-list-light",
      minus: "i-ph-minus-light",
      panelClose: "i-ph-sidebar-simple-light",
      panelOpen: "i-ph-sidebar-simple-light",
      plus: "i-ph-plus-light",
      search: "i-ph-magnifying-glass-light",
    },
    dashboardPanel: {
      slots: {
        root: "dms-canvas",

        body: "flex flex-col gap-4 sm:gap-6 flex-1 overflow-y-auto [scrollbar-gutter:stable] p-0 sm:p-0 pt-5 sm:pt-5 lg:pt-7",
      },
    },
    dashboardNavbar: {
      slots: {
        root: "gap-2 px-3 sm:px-4",
        left: "gap-1",
        right: "gap-0.5",
      },
    },

    dashboardSearch: {
      slots: {
        modal:
          "sm:max-w-[680px] sm:rounded-[18px] ring-(--dms-border-top) shadow-[var(--dms-shadow-cmdk),var(--dms-halo-accent)]",
        input:
          "[&_input]:h-16 [&_input]:text-xl [&_input]:font-[450] [&_input]:tracking-[-0.01em]",
      },
      variants: {
        fullscreen: {
          false: { modal: "sm:h-auto sm:max-h-[min(560px,76vh)]" },
        },
      },
    },
    commandPalette: {
      slots: {
        group: "p-1.5",
        footer:
          "flex h-10 items-center gap-4 bg-(--dms-bg-muted) px-4 text-[11.5px] text-muted",
        itemLabelBase: "text-[13.5px] font-medium",
        itemDescription: "text-xs",
      },
      variants: {
        size: {
          md: {
            label: `${EYEBROW_CLASS} px-2.5 pt-2.5 pb-1.5 text-dimmed`,
            item: "h-11 items-center gap-3 rounded-[10px] px-2.5 before:rounded-[10px]",

            itemLeadingIcon:
              "size-7 rounded-lg border border-default bg-(--ui-bg) p-[5px] text-muted",
          },
        },
      },
      compoundVariants: [
        {
          active: true,
          class: {
            item: "before:bg-primary/10",
            itemLeadingIcon: "border-primary/35 text-primary",
          },
        },
      ],
    },
    navigationMenu: {
      slots: {
        label: `${EYEBROW_CLASS} text-dimmed pt-1 pb-1.5 [&>svg]:hidden`,

        separator: "h-0 my-0.5 bg-transparent",

        link: "text-[13.5px] gap-2.5",
        linkLeadingIcon: "size-[17px]",
        linkTrailingIcon: "size-4",
        childLink: "text-[13px] gap-2.5 font-normal",
        childLinkIcon: "size-[15px]",
      },
      compoundVariants: [
        {
          variant: "pill",
          active: true,
          highlight: false,
          class: {
            link: "before:bg-primary/10 font-semibold",
          },
        },
        {
          variant: "pill",
          active: true,
          highlight: true,
          disabled: false,
          class: {
            link: "before:bg-primary/10 hover:before:bg-primary/15 font-semibold",
          },
        },

        {
          orientation: "vertical",
          highlight: true,
          level: true,
          active: true,
          class: {
            link: "before:-start-1.5 before:rounded-s-none after:inset-y-0 after:w-[2px] after:rounded-none",
          },
        },

        ...NAVIGATION_MENU_HORIZONTAL_COMPOUNDS,
      ],
    },

    ...actionsTheme,

    ...formControlsTheme,

    ...surfacesTheme,

    ...navigationTheme,

    ...dataTheme,
    breadcrumb: {
      slots: {
        list: "gap-1",
        link: "text-[13.5px] font-medium rounded-[6px] px-1.5 py-[3px] hover:bg-elevated aria-[current=page]:text-highlighted aria-[current=page]:font-semibold aria-[current=page]:hover:bg-transparent",
        linkLeadingIcon: "size-[15px]",
        separatorIcon: "size-3.5",
      },
    },
  },
  branding: {
    logo: dmsLogo(),
    defaults: { logo: dmsLogo(), colors: dmsColors() },
    footer: {
      copyright: "Antelope",
      localeSwitcher: true,
    },
  },
};
