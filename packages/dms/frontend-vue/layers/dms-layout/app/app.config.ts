import { actionsTheme } from "./theme/actions";
import { dataTheme } from "./theme/data";
import { formControlsTheme } from "./theme/form-controls";
import {
  NAVIGATION_MENU_HORIZONTAL_COMPOUNDS,
  navigationTheme,
} from "./theme/navigation";
import { surfacesTheme } from "./theme/surfaces";

export default {
  ui: {
    colors: {
      primary: "dms",
      // The AI accent of the v2 design.
      secondary: "violet",
      neutral: "neutral",
      // Design semantic hexes map exactly onto these Tailwind palettes:
      // success #10b981 (emerald), warning #f59e0b (amber),
      // error #ef4444 (red), info #06b6d4 (cyan).
      success: "emerald",
      warning: "amber",
      error: "red",
      info: "cyan",
    },
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
        // v2 page padding (28px top, 64px bottom; 20/48 on small screens); the
        // container inside sets the horizontal gutter. The scrollbar gutter is
        // reserved so centred content doesn't shift between short and long pages.
        body: "flex flex-col gap-4 sm:gap-6 flex-1 overflow-y-auto [scrollbar-gutter:stable] p-0 sm:p-0 pt-5 pb-12 lg:pt-7 lg:pb-16",
      },
    },
    dashboardNavbar: {
      slots: {
        root: "gap-2 px-3 sm:px-4",
        left: "gap-1",
        right: "gap-0.5",
      },
    },
    // v2 command palette: a 680px frame one border step up, the deepest
    // shadow with an accent halo, and a 64px search field.
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
            label:
              "px-2.5 pt-2.5 pb-1.5 font-mono text-[10.5px] font-semibold tracking-[0.12em] text-dimmed uppercase",
            item: "h-11 items-center gap-3 rounded-[10px] px-2.5 before:rounded-[10px]",
            // A bordered well around each result's icon; SVG padding shrinks
            // the glyph inside the 28px box.
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
        // Section labels as v2 eyebrows (mono 10.5px/600, uppercase, 0.12em
        // tracking, dimmed), without the category icon.
        label:
          "font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase text-dimmed pt-1 pb-1.5 [&>svg]:hidden",
        // v2 sections are set apart by spacing alone, with no rule between.
        separator: "h-0 my-0.5 bg-transparent",
        // Sidebar density from the design (.nav-head 13.5px/500, .nav-sub
        // 13px/450, 10px gap) and smaller icons (design 17px head / 15px sub
        // vs Nuxt UI's 20px size-5).
        link: "text-[13.5px] gap-2.5",
        linkLeadingIcon: "size-[17px]",
        linkTrailingIcon: "size-4",
        childLink: "text-[13px] gap-2.5 font-normal",
        childLinkIcon: "size-[15px]",
      },
      compoundVariants: [
        // Active item box in primary tint (design: accent-bg) instead of
        // the default elevated gray.
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
        // Nested active item (design nav-sub.is-active): the box extends
        // left to the child guide line with a flat edge, and the primary
        // bar covers the full row height on that line.
        {
          orientation: "vertical",
          highlight: true,
          level: true,
          active: true,
          class: {
            link: "before:-start-1.5 before:rounded-s-none after:inset-y-0 after:w-[2px] after:rounded-none",
          },
        },
        // Top bars and record sub-navigation (theme/navigation.ts).
        ...NAVIGATION_MENU_HORIZONTAL_COMPOUNDS,
      ],
    },
    // Buttons, badges, kbd, tabs.
    ...actionsTheme,
    // Inputs, selects, checkbox, radio, switch, form field, calendar…
    ...formControlsTheme,
    // Cards, menus, popovers, tooltips, overlays, toasts, alerts…
    ...surfacesTheme,
    // Stepper, pagination, links, dashboard sidebar.
    ...navigationTheme,
    // Plain UTable, tree, chip, separator, empty state.
    ...dataTheme,
    breadcrumb: {
      slots: {
        // v2 .breadcrumb: 13.5px medium muted links on a hover tint, the
        // current segment in ink, and small icons (Nuxt UI defaults to 20px).
        list: "gap-1",
        link: "text-[13.5px] font-medium rounded-[6px] px-1.5 py-[3px] hover:bg-elevated aria-[current=page]:text-highlighted aria-[current=page]:font-semibold aria-[current=page]:hover:bg-transparent",
        linkLeadingIcon: "size-[15px]",
        separatorIcon: "size-3.5",
      },
    },
  },
  branding: {
    logo: {
      default: {
        light: "/images/antelope-logo/light.svg",
        dark: "/images/antelope-logo/dark.svg",
      },
      collapsed: {
        light: "/images/antelope-logo/icon.svg",
        dark: "/images/antelope-logo/icon.svg",
      },
    },
  },
};
