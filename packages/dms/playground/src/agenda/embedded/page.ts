import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { KeyValueList } from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { FullAgenda } from "@antelopejs/interface-dms/base/full-agenda";
import { demoGuide } from "../../table-view/guide";
import { AGENDA_API, agendaCategory } from "../category";
import { TEAM_CALENDARS } from "../team/data";
import { onCallData, ROOMS } from "./data";

export const AGENDA_EMBEDDED_SLUG = "agenda-embedded";
export const AGENDA_EMBEDDED_API = `${AGENDA_API}/embedded`;

const NARROW_COMPACT_BELOW = 640;

const BOOKINGS = {
  fetchUrl: `${AGENDA_EMBEDDED_API}/events`,
  saveUrl: `${AGENDA_EMBEDDED_API}/save`,
  calendars: TEAM_CALENDARS,
  resources: ROOMS,
  weekStartsOn: 1 as const,
  dayStart: "08:00",
  dayEnd: "19:00",
};

// The room planning opened in a modal: a column per room for one day.
const roomsModal = FullAgenda({
  ...BOOKINGS,
  views: [
    { id: "rooms", type: "resources", duration: 1, label: "Salles" },
    "week",
  ],
  sidebar: false,
  details: { container: "popover" },
  urlState: false,
  height: "fill",
});

// The bookings opened in a drawer: the list of the next days, or one day.
const bookingsDrawer = FullAgenda({
  ...BOOKINGS,
  views: [{ id: "next", type: "list", duration: 14, label: "À venir" }, "day"],
  sidebar: false,
  toolbar: { title: false, refresh: true },
  details: { container: "popover" },
  urlState: false,
  height: "fill",
});

@RegisterPage()
export class PageAgendaEmbedded extends PageController(
  AGENDA_EMBEDDED_SLUG,
  {
    displayName: "In containers (grid, modal, drawer)",
    icon: "i-ph-squares-four",
    category: agendaCategory,
    order: 70,
    description:
      "The agenda wherever a block goes: in a narrow grid column beside a list, in a modal and in a drawer opened from the header, and read-only from static data without a toolbar. It adapts to the width it is given, not to the window's.",
  },
  DefaultLayout({
    fullWidth: true,
    headerActions: [
      {
        label: "Room planning",
        icon: "i-ph-frame-corners",
        target: {
          type: "modal",
          size: "5xl",
          title: "Planning des salles",
          description: "Une colonne par salle, pour la journée",
          component: roomsModal,
        },
      },
      {
        label: "My bookings",
        icon: "i-ph-sidebar-simple",
        target: {
          type: "drawer",
          direction: "right",
          size: "lg",
          title: "Réservations à venir",
          component: bookingsDrawer,
        },
      },
      {
        label: "Reset the bookings",
        icon: "i-ph-arrow-counter-clockwise",
        target: {
          type: "api",
          url: `${AGENDA_EMBEDDED_API}/reset`,
          method: "POST",
          successMessage: "The bookings are back as they started",
        },
      },
    ],
  }),
) {
  static guide = demoGuide([
    {
      label: "Look at the narrow column",
      text: "A Grid row of three blocks: the rooms, the booking rules, and the agenda in the third column. The agenda measures its own width (not the window's): under responsive.compactBelow it folds its sidebar into a toolbar button and turns the week into a day (compactView).",
    },
    {
      label: "Open the room planning",
      text: 'A header button whose target is a modal holding a FullAgenda (type: "modal", component): a resources view, a column per room; height "fill" takes the modal\'s body.',
    },
    {
      label: "Open my bookings",
      text: 'A drawer target (type: "drawer", direction: "right") holding a FullAgenda: the next 14 days as a list. Book a room twice at once from either: the route refuses it, in every container alike.',
    },
    {
      label: "Read the on-call turns",
      text: "staticData and no saveUrl: a read-only agenda without a route; toolbar: false hides the whole toolbar, the month view is its only view.",
    },
  ]);

  static layout = Grid({ gap: "1rem" }).child(
    "row",
    GridRow()
      .child(
        "rooms",
        KeyValueList({
          title: "Salles de réunion",
          items: ROOMS.map(({ id, label, description }) => ({
            id,
            label,
            value: description,
          })),
        }),
      )
      .child(
        "rules",
        KeyValueList({
          title: "Règles de réservation",
          items: [
            { label: "Durée", value: "30 min à 4 h" },
            { label: "Horaires", value: "08:00 – 19:00" },
            { label: "Une salle", value: "une réservation à la fois" },
            { label: "Annulation", value: "jusqu'à l'heure de début" },
          ],
        }),
      )
      .child(
        "agenda",
        FullAgenda({
          ...BOOKINGS,
          title: "Réservations",
          views: ["week", "day", "list"],
          sidebar: { sections: ["miniCalendar", "calendars"] },
          responsive: {
            compactBelow: NARROW_COMPACT_BELOW,
            compactView: "day",
          },
          details: { container: "drawer" },
          height: "34rem",
        }),
      ),
  );

  static onCall = FullAgenda({
    title: "Astreintes IT",
    staticData: onCallData(),
    views: ["month"],
    weekStartsOn: 1,
    toolbar: false,
    height: "26rem",
  });
}
