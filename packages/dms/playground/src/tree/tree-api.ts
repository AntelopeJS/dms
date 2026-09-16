import { Controller, Get } from "@antelopejs/interface-api";

export class TreeAPIController extends Controller("/api/tree") {
  @Get("data")
  getTreeData() {
    return [
      {
        value: "root-1",
        label: "Documents",
        icon: "i-ph-folder",
        expandable: true,
        selectable: true,
        children: [
          {
            value: "doc-1",
            label: "Project Proposal.pdf",
            icon: "i-ph-file-pdf",
            selectable: true,
          },
          {
            value: "doc-2",
            label: "Meeting Notes.docx",
            icon: "i-ph-file-doc",
            selectable: true,
          },
          {
            value: "folder-reports",
            label: "Reports",
            icon: "i-ph-folder",
            expandable: true,
            selectable: true,
            hasChildren: true,
            lazyLoadUrl: "/api/tree/reports",
            children: [],
          },
        ],
      },
      {
        value: "root-2",
        label: "Media",
        icon: "i-ph-folder",
        expandable: true,
        selectable: true,
        children: [
          {
            value: "media-images",
            label: "Images",
            icon: "i-ph-folder",
            expandable: true,
            selectable: true,
            children: [
              {
                value: "img-1",
                label: "Logo.png",
                icon: "i-ph-image",
                selectable: true,
              },
              {
                value: "img-2",
                label: "Banner.jpg",
                icon: "i-ph-image",
                selectable: true,
              },
            ],
          },
          {
            value: "media-videos",
            label: "Videos",
            icon: "i-ph-folder",
            expandable: true,
            selectable: true,
            children: [
              {
                value: "vid-1",
                label: "Tutorial.mp4",
                icon: "i-ph-video",
                selectable: true,
              },
            ],
          },
        ],
      },
      {
        value: "root-3",
        label: "Code",
        icon: "i-ph-folder",
        expandable: true,
        selectable: true,
        children: [
          {
            value: "code-src",
            label: "src",
            icon: "i-ph-folder",
            expandable: true,
            selectable: true,
            children: [
              {
                value: "file-index",
                label: "index.ts",
                icon: "i-ph-file-ts",
                selectable: true,
              },
              {
                value: "file-app",
                label: "app.vue",
                icon: "i-ph-file-vue",
                selectable: true,
              },
              {
                value: "file-styles",
                label: "styles.css",
                icon: "i-ph-file-css",
                selectable: true,
              },
            ],
          },
          {
            value: "code-tests",
            label: "tests",
            icon: "i-ph-folder",
            expandable: true,
            selectable: false,
            children: [
              {
                value: "test-unit",
                label: "unit.test.ts",
                icon: "i-ph-test-tube",
                selectable: true,
              },
            ],
          },
        ],
      },
    ];
  }

  @Get("reports")
  getReportsChildren() {
    return [
      {
        value: "report-q1",
        label: "Q1 Report.xlsx",
        icon: "i-ph-file-xls",
        selectable: true,
      },
      {
        value: "report-q2",
        label: "Q2 Report.xlsx",
        icon: "i-ph-file-xls",
        selectable: true,
      },
      {
        value: "report-annual",
        label: "Annual Report.pdf",
        icon: "i-ph-file-pdf",
        selectable: true,
      },
    ];
  }

  @Get("lazy")
  getLazyData() {
    return [
      {
        value: "lazy-1",
        label: "Folder 1",
        icon: "i-ph-folder",
        expandable: true,
        selectable: true,
        hasChildren: true,
        lazyLoadUrl: "/api/tree/lazy-children",
        children: [],
      },
      {
        value: "lazy-2",
        label: "Folder 2",
        icon: "i-ph-folder",
        expandable: true,
        selectable: true,
        hasChildren: true,
        lazyLoadUrl: "/api/tree/lazy-children",
        children: [],
      },
      {
        value: "file-1",
        label: "readme.txt",
        icon: "i-ph-file-text",
        selectable: true,
      },
    ];
  }

  @Get("lazy-children")
  getLazyChildren() {
    return [
      {
        value: "child-1",
        label: "document.pdf",
        icon: "i-ph-file-pdf",
        selectable: true,
      },
      {
        value: "child-2",
        label: "image.png",
        icon: "i-ph-image",
        selectable: true,
      },
    ];
  }

  @Get("error-test")
  getErrorTestData() {
    return [
      {
        value: "error-folder-1",
        label: "Folder 1",
        icon: "i-ph-folder",
        expandable: true,
        selectable: true,
        hasChildren: true,
        lazyLoadUrl: "/api/tree/nonexistent-endpoint",
        children: [],
      },
      {
        value: "error-folder-2",
        label: "Folder 2",
        icon: "i-ph-folder",
        expandable: true,
        selectable: true,
        hasChildren: true,
        lazyLoadUrl: "/api/tree/nonexistent-endpoint",
        children: [],
      },
      {
        value: "error-folder-3",
        label: "Folder 3",
        icon: "i-ph-folder",
        expandable: true,
        selectable: true,
        hasChildren: true,
        lazyLoadUrl: "/api/tree/nonexistent-endpoint",
        children: [],
      },
    ];
  }
}
