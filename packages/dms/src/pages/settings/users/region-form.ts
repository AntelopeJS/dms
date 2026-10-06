import { HttpMethod } from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { DASHBOARD_LANGUAGE_ITEMS } from "./dashboard-languages";
import { AUTOMATIC_PREFERENCE } from "./regional-preferences";

export const REGION_PREFERENCES_URL = "/settings/user/region/preferences";

const TEXTS = "$page.settings.region";
const SUNDAY = 0;
const MONDAY = 1;
const SATURDAY = 6;

const automatic = { label: `${TEXTS}.auto`, value: AUTOMATIC_PREFERENCE };

function segmented(
  items: DefaultDataTypes.SelectTypeOptions["items"],
): DefaultDataTypes.SelectType {
  return new DefaultDataTypes.SelectType({
    items: [automatic, ...items],
    display: "segmented",
    deselectable: false,
  });
}

/**
 * The Language & region page: one form saving each preference as it is
 * picked. "Automatic" stands for a preference left unset, which the API
 * stores as null.
 */
export function regionPreferencesForm() {
  return Form({
    saveMode: "instant",
    sectionNav: "none",
    fetchUrl: REGION_PREFERENCES_URL,
    submitUrl: REGION_PREFERENCES_URL,
    submitUrlMethod: HttpMethod.post,
    sections: [
      {
        id: "language",
        label: `${TEXTS}.language_block_title`,
        description: `${TEXTS}.language_block_description`,
        fields: [
          {
            id: "language",
            label: `${TEXTS}.language_title`,
            description: `${TEXTS}.language_description`,
            type: new DefaultDataTypes.SelectType({
              items: DASHBOARD_LANGUAGE_ITEMS,
              deselectable: false,
            }),
            required: true,
          },
        ],
      },
      {
        id: "time",
        label: `${TEXTS}.time_block_title`,
        description: `${TEXTS}.time_block_description`,
        fields: [
          {
            id: "timeZone",
            label: `${TEXTS}.time_zone_title`,
            description: `${TEXTS}.time_zone_description`,
            type: new DefaultDataTypes.StringType(),
            // The zones with their current offset and the browser's own as
            // "Automatic": a list only the browser can draw.
            inputComponent: CustomComponent(
              "DmsRegionTimeZoneInput",
            ).serializeSync(),
          },
          {
            id: "weekStart",
            label: `${TEXTS}.week_start_title`,
            description: `${TEXTS}.week_start_hint`,
            type: segmented([
              { label: `${TEXTS}.weekday_monday`, value: MONDAY },
              { label: `${TEXTS}.weekday_sunday`, value: SUNDAY },
              { label: `${TEXTS}.weekday_saturday`, value: SATURDAY },
            ]),
          },
          {
            id: "timeFormat",
            label: `${TEXTS}.time_format_title`,
            description: `${TEXTS}.time_format_hint`,
            type: segmented([
              { label: `${TEXTS}.time_24`, value: "h23" },
              { label: `${TEXTS}.time_12`, value: "h12" },
            ]),
          },
          {
            id: "dateFormat",
            label: `${TEXTS}.date_format_title`,
            description: `${TEXTS}.date_format_hint`,
            type: segmented([
              { label: `${TEXTS}.date_numeric`, value: "numeric" },
              { label: `${TEXTS}.date_text`, value: "text" },
            ]),
          },
        ],
      },
    ],
  });
}
