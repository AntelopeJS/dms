import { Controller, Get } from "@antelopejs/interface-api";

export class TabTreeAPIFiles extends Controller("/api/tree") {
  @Get("files")
  getFilesData() {
    return [
      {
        label: "src",
        value: "src",
        icon: "i-ph-folder",
        hasChildren: true,
        lazyLoadUrl: "/api/tree/files/src",
      },
      {
        label: "package.json",
        value: "package.json",
        icon: "i-ph-file-code",
      },
      {
        label: "tsconfig.json",
        value: "tsconfig.json",
        icon: "i-ph-file-code",
      },
      {
        label: "README.md",
        value: "readme.md",
        icon: "i-ph-file-text",
      },
    ];
  }

  @Get("files/src")
  getFilesSrcData() {
    return [
      {
        label: "components",
        value: "src-components",
        icon: "i-ph-folder",
        hasChildren: true,
      },
      {
        label: "utils",
        value: "src-utils",
        icon: "i-ph-folder",
        hasChildren: true,
      },
      {
        label: "index.ts",
        value: "src-index",
        icon: "i-ph-file-code",
      },
    ];
  }

  @Get("components")
  getComponentsData() {
    return [
      {
        label: "Button",
        value: "button",
        icon: "i-ph-square",
        badge: "v2.1",
      },
      {
        label: "Forms",
        value: "forms",
        icon: "i-ph-folder",
        hasChildren: true,
        children: [
          {
            label: "Input",
            value: "input",
            icon: "i-ph-textbox",
          },
          {
            label: "Select",
            value: "select",
            icon: "i-ph-caret-down",
          },
          {
            label: "Checkbox",
            value: "checkbox",
            icon: "i-ph-check-square",
          },
        ],
      },
      {
        label: "Table",
        value: "table",
        icon: "i-ph-table",
        badge: "new",
      },
      {
        label: "Tree",
        value: "tree",
        icon: "i-ph-tree-structure",
      },
    ];
  }

  @Get("database")
  getDatabaseData() {
    return [
      {
        label: "Users",
        value: "users",
        icon: "i-ph-users",
        hasChildren: true,
        children: [
          {
            label: "id",
            value: "users-id",
            icon: "i-ph-key",
          },
          {
            label: "name",
            value: "users-name",
            icon: "i-ph-text-t",
          },
          {
            label: "email",
            value: "users-email",
            icon: "i-ph-envelope",
          },
        ],
      },
      {
        label: "Tasks",
        value: "tasks",
        icon: "i-ph-clipboard-text",
        hasChildren: true,
        children: [
          {
            label: "id",
            value: "tasks-id",
            icon: "i-ph-key",
          },
          {
            label: "title",
            value: "tasks-title",
            icon: "i-ph-text-t",
          },
          {
            label: "status",
            value: "tasks-status",
            icon: "i-ph-flag",
          },
        ],
      },
    ];
  }
}
