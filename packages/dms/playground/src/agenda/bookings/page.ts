import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { FullAgenda } from "@antelopejs/interface-dms/base/full-agenda";
import type { DemoStep } from "../../table-view/guide";
import { compactGuide } from "../guide";
import { AGENDA_API, agendaCategory, agendaPagePath } from "../category";
import { DEMO_TIME_ZONE } from "../time";
import { BOOKING_HOSTS, BOOKING_ROOMS } from "./data";

export const AGENDA_BOOKINGS_SLUG = "agenda-bookings";
export const AGENDA_BOOKINGS_API = `${AGENDA_API}/bookings`;
/** The topic a save publishes on: every tab showing the bookings reads them again. */
export const BOOKINGS_TOPIC = "playground:agenda-bookings";

/** The hours the rooms open, as the route checks them. */
export const BOOKINGS_OPEN = "08:00";
export const BOOKINGS_CLOSE = "19:00";

/** What to try on the page, listed in full on the overview page. */
export const BOOKINGS_STEPS: DemoStep[] = [
  {
    label: "Book the first free hour",
    text: 'propose: { param: "plan", url }: the toolbar\'s "First free hour" opens the page with ?plan=next; the agenda reads the proposal route, goes to its day and opens a new booking prefilled there, which you check and save. The key leaves the URL, so a reload books nothing.',
  },
  {
    label: "Pick a guest",
    text: 'A relation field: type two letters of a company or a contact ("ac", "tom"); the route answers the guests matching, the form keeps the guest\'s id and draws its name.',
  },
  {
    label: "Pick a kind",
    text: "The route answers the kinds of booking (fieldOptions) with the length each presets (durationMinutes): picking Workshop on a new booking ends it 90 minutes after its start.",
  },
  {
    label: "Save a booking without a room",
    text: 'The route refuses it under the Room field (field: "resourceIds"), with no Retry (retryable: false); the form stays open on it.',
  },
  {
    label: "Show two rooms at a time",
    text: "The Rooms view has resourcesAtOnce: 2: the sidebar's room list picks which two; Room D is read-only (closed for works).",
  },
  {
    label: "Read the chips",
    text: "Each chip draws its step (mark: Booked, Checked in, In progress), a guest's alert (alert badge) and an overbooked slot (pinned badge) whatever its height, and the kind with its length as the subtitle.",
  },
  {
    label: "Check a guest in from the keyboard",
    text: "Focus a booked chip and press Shift+I: the Check in action runs (shortcut), where its condition holds.",
  },
  {
    label: "Open two tabs",
    text: "A save publishes on the page's topic (realtimeTopic): the other tab reads the bookings again. Hiding a host in the legend asks the route for the others only (legend.serverFilter).",
  },
  {
    label: "Print the day",
    text: "toolbar.print prints the day shown on an A4 landscape sheet; narrow the window under 1100 px and the sidebar folds (sidebar.foldBelow).",
  },
];

@RegisterPage()
export class PageAgendaBookings extends PageController(
  AGENDA_BOOKINGS_SLUG,
  {
    displayName: "Room bookings",
    icon: "i-ph-door",
    category: agendaCategory,
    order: 15,
    description:
      "Four rooms booked by three hosts: a booking mode that proposes the first free hour, a guest picked by searching, kinds that preset a length, a refusal under its field, two rooms at a time, marks and alerts on every chip, a keyboard action, realtime and print.",
  },
  DefaultLayout({
    fullWidth: true,
    fillHeight: true,
    headerActions: [
      {
        label: "Reset the bookings",
        icon: "i-ph-arrow-counter-clockwise",
        target: {
          type: "api",
          url: `${AGENDA_BOOKINGS_API}/reset`,
          method: "POST",
          successMessage: "The bookings are back as they started",
        },
      },
    ],
  }),
) {
  static guide = compactGuide(
    'Press "First free hour" to book in booking mode; pick a guest by typing two letters; save a booking without a room to see the refusal under its field.',
  );

  static agenda = FullAgenda({
    title: "Room bookings",
    fetchUrl: `${AGENDA_BOOKINGS_API}/events`,
    saveUrl: `${AGENDA_BOOKINGS_API}/save`,
    realtimeTopic: BOOKINGS_TOPIC,
    calendars: BOOKING_HOSTS,
    resources: BOOKING_ROOMS,
    views: [
      { id: "rooms", type: "resources", label: "Rooms", resourcesAtOnce: 2 },
      "week",
      "day",
      "list",
    ],
    initialView: "rooms",
    weekStartsOn: 1,
    timeZone: DEMO_TIME_ZONE,
    dayStart: "07:00",
    dayEnd: "20:00",
    scrollTime: BOOKINGS_OPEN,
    businessHours: [
      { days: [1, 2, 3, 4, 5], start: BOOKINGS_OPEN, end: BOOKINGS_CLOSE },
    ],
    defaultDurationMinutes: 60,
    create: { trigger: "click", defaultResource: true },
    conflicts: "detect",
    fields: [
      { id: "kind", label: "Kind", kind: "select" },
      {
        id: "guestId",
        label: "Guest",
        kind: "relation",
        relation: {
          searchUrl: `${AGENDA_BOOKINGS_API}/guests`,
          minChars: 2,
        },
        placeholder: "Company or contact",
      },
      { id: "calendarId", label: "Host" },
      { id: "resourceIds", label: "Room", multiple: false },
      { id: "start", label: "Start" },
      { id: "end", label: "End" },
      {
        id: "equipment",
        label: "Equipment",
        kind: "select",
        multiple: true,
        options: [
          { value: "projector", label: "Projector" },
          { value: "whiteboard", label: "Whiteboard" },
          { value: "video", label: "Video call" },
        ],
      },
      { id: "description", label: "Notes", kind: "longText" },
    ],
    details: { container: "drawer" },
    eventActions: [
      {
        id: "check-in",
        label: "Check in",
        icon: "i-ph-door-open",
        shortcut: "I",
        visibleWhen: { field: "step", in: ["booked"] },
        target: {
          type: "api",
          url: `${AGENDA_BOOKINGS_API}/check-in?id={{row.id}}`,
          method: "POST",
          successMessage: "Checked in",
        },
      },
    ],
    toolbarActions: [
      {
        id: "first-free-hour",
        label: "First free hour",
        icon: "i-ph-magic-wand",
        target: {
          type: "page",
          url: `${agendaPagePath(AGENDA_BOOKINGS_SLUG)}?plan=next`,
        },
      },
    ],
    propose: { param: "plan", url: `${AGENDA_BOOKINGS_API}/proposal` },
    recurringEdit: "ask",
    recurringTexts: {
      title: "Repeated booking",
      occurrence: "This day only",
      series: "Every week from this day",
    },
    detailsTexts: {
      newTitle: "New booking",
      resources: "Rooms",
      deleteTitle: "Cancel this booking?",
      deleteDescription: "{title} leaves the room plan.",
      failed: "{title} could not be saved in {resource}",
    },
    sidebar: {
      position: "left",
      sections: ["miniCalendar", "resources", "calendars", "upcoming"],
      foldBelow: 1100,
    },
    legend: { title: "Hosts", toggles: true, counts: true, serverFilter: true },
    toolbar: { datePicker: true, refresh: true, print: true },
    eventContent: { subtitle: true },
  });
}
