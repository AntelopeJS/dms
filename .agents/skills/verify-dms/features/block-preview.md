---
covers:
  - packages/dms/src/routes/block-preview.ts
  - packages/dms/src/pages/public/preview/**
  - packages/dms/src/pages/preview.ts
  - packages/dms/src/implementations/dms/page/preview-*.ts
  - packages/dms/frontend-vue/layers/dms-layout/app/custom-layouts/PreviewLayout.vue
docs:
  - packages/dms/docs/08.ai-and-claude-code/7.block-preview-page.md
---

# Block preview

The public `/dms-preview` page renders a tree of registered blocks from `?state=` or from a postMessage, without the dashboard chrome. `GET /api/block-preview/types` lists the blocks it may draw.

## Sub-features

- `preview-renders-state`: a KpiCard tree in `?state=` draws its title, value and delta with no sidebar, also after a reload.
- `preview-refuses-unknown-and-remote`: error path: an unregistered type and an off-site `fetchUrl` render inline notices, and the page never requests the off-site URL.
- `preview-empty-and-unreadable`: empty and error path: no state says "Nothing to preview yet", a malformed one "The preview state could not be read."
- `preview-postmessage-render`: an embedding page receives `ready`, posts `render` on the `dms-preview` channel, and the frame draws the tree and reports its height.
- `block-types-api-members-only`: Exposure: the types API answers a member and refuses a visitor.

## How to get to it (user POV)

- Open `<dashboard>/dms-preview?state=<base64url JSON>`, or embed it in an iframe as the docs do.

## Driving it with dms-control

```bash
dms-control journey "$RUN" block-preview [journey-id...]
```

Evidence is under `$RUN/evidence/block-preview/<journey>/`.

## Gotchas

- The page is enabled because the playground sets `docsPreview: true`. The development-mode and `DMS_DOCS_PREVIEW` gates are not driven.
