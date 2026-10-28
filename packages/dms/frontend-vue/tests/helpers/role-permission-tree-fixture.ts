import type { RolePermissionNode } from "../../layers/dms-layout/app/entries/components/pages/settings/roles/role-types";

const TREE: RolePermissionNode[] = [
  {
    id: "pages",
    label: "Pages",
    children: [
      {
        id: "pages.form",
        label: "Form",
        children: [
          {
            id: "pages.form.simple",
            label: "Simple form",
            children: [{ id: "pages.form.simple.form", label: "Form" }],
          },
          {
            id: "pages.form.table",
            label: "Table page",
            children: [
              {
                id: "pages.form.table.table",
                label: "Table",
                children: [
                  {
                    id: "pages.form.table.table.add",
                    label: "Add",
                    children: [
                      { id: "pages.form.table.table.add.form", label: "Form" },
                    ],
                  },
                  { id: "pages.form.table.table.list", label: "List" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    children: [
      {
        id: "settings.user",
        label: "User settings",
        children: [
          {
            id: "settings.user.profile",
            label: "Profile",
            children: [{ id: "settings.user.profile.profile", label: "Info" }],
          },
        ],
      },
    ],
  },
];

export { TREE };
