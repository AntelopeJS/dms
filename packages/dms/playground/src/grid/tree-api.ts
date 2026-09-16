import { Controller, Get } from "@antelopejs/interface-api";

export class LayoutGridAPIController extends Controller("/api/layout-grid") {
  @Get("files")
  getFilesData() {
    return [
      {
        value: "src",
        label: "src",
        icon: "i-ph-folder",
        expandable: true,
        selectable: true,
        children: [
          {
            value: "components",
            label: "components",
            icon: "i-ph-folder",
            expandable: true,
            selectable: true,
            children: [
              {
                value: "Button.vue",
                label: "Button.vue",
                icon: "i-ph-file-vue",
                selectable: true,
              },
              {
                value: "Input.vue",
                label: "Input.vue",
                icon: "i-ph-file-vue",
                selectable: true,
              },
              {
                value: "Modal.vue",
                label: "Modal.vue",
                icon: "i-ph-file-vue",
                selectable: true,
              },
            ],
          },
          {
            value: "utils",
            label: "utils",
            icon: "i-ph-folder",
            expandable: true,
            selectable: true,
            children: [
              {
                value: "helpers.ts",
                label: "helpers.ts",
                icon: "i-ph-file-ts",
                selectable: true,
              },
              {
                value: "validation.ts",
                label: "validation.ts",
                icon: "i-ph-file-ts",
                selectable: true,
              },
            ],
          },
          {
            value: "index.ts",
            label: "index.ts",
            icon: "i-ph-file-ts",
            selectable: true,
          },
          {
            value: "App.vue",
            label: "App.vue",
            icon: "i-ph-file-vue",
            selectable: true,
          },
        ],
      },
      {
        value: "public",
        label: "public",
        icon: "i-ph-folder",
        expandable: true,
        selectable: true,
        children: [
          {
            value: "images",
            label: "images",
            icon: "i-ph-folder",
            expandable: true,
            selectable: true,
            children: [
              {
                value: "logo.png",
                label: "logo.png",
                icon: "i-ph-image",
                selectable: true,
              },
              {
                value: "favicon.ico",
                label: "favicon.ico",
                icon: "i-ph-image",
                selectable: true,
              },
            ],
          },
          {
            value: "index.html",
            label: "index.html",
            icon: "i-ph-file-html",
            selectable: true,
          },
        ],
      },
      {
        value: "tests",
        label: "tests",
        icon: "i-ph-folder",
        expandable: true,
        selectable: true,
        children: [
          {
            value: "unit",
            label: "unit",
            icon: "i-ph-folder",
            expandable: true,
            selectable: true,
            children: [
              {
                value: "Button.test.ts",
                label: "Button.test.ts",
                icon: "i-ph-test-tube",
                selectable: true,
              },
              {
                value: "Input.test.ts",
                label: "Input.test.ts",
                icon: "i-ph-test-tube",
                selectable: true,
              },
            ],
          },
          {
            value: "e2e",
            label: "e2e",
            icon: "i-ph-folder",
            expandable: true,
            selectable: true,
            children: [
              {
                value: "app.e2e.ts",
                label: "app.e2e.ts",
                icon: "i-ph-test-tube",
                selectable: true,
              },
            ],
          },
        ],
      },
      {
        value: "package.json",
        label: "package.json",
        icon: "i-ph-file-code",
        selectable: true,
      },
      {
        value: "README.md",
        label: "README.md",
        icon: "i-ph-file-text",
        selectable: true,
      },
    ];
  }

  @Get("tabs-data")
  getTabsData() {
    return [
      {
        label: "Overview",
        content: "Project overview and general information",
      },
      {
        label: "Settings",
        content: "Configuration and project settings",
      },
      {
        label: "Documentation",
        content: "Project documentation and guides",
      },
    ];
  }
}
