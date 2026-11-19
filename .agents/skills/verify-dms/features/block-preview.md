---
covers:
  - packages/dms/src/routes/block-preview.ts
  - packages/dms/src/pages/public/preview/**
  - packages/dms/src/pages/preview.ts
  - packages/dms/src/implementations/dms/page/preview-*.ts
  - packages/dms/frontend-vue/layers/dms-layout/app/custom-layouts/PreviewLayout.vue
  - packages/dms/frontend-vue/layers/dms-ui/app/build/utils/blockPreview.ts
  - packages/dms/frontend-vue/layers/dms-ui/app/entries/utils/blockPreview.ts
  - packages/dms/frontend-vue/layers/dms-ui/app/build/components/block-preview/**
  - packages/dms/frontend-vue/layers/dms-ui/app/components/block-preview/**
  - packages/dms/frontend-vue/layers/dms-ui/app/build/composables/block-preview/**
  - packages/dms/frontend-vue/layers/dms-ui/app/entries/composables/block-preview/**
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
- `preview-renders-every-starter`: every node the `/mockup` Add tab starts a block as (`frontend-vue/tests/fixtures/mockup-starters/nodes.json`, but those reading a mockup fixture) draws with no page error and no error screen.

## Checked by the integration suite

These checks make no browser tab, so they run in the backend suite (`pnpm --dir packages/dms test:integration`), not as journeys.

- `block-types-api-members-only`: `GET /api/block-preview/types` answers a member with the block catalog (`KpiCard` among it) and refuses a visitor with 401. Held by `packages/dms/src/test/integration/block-preview-types.test.ts`.

## How to get to it (user POV)

- Open `<dashboard>/dms-preview?state=<base64url JSON>`, or embed it in an iframe as the docs do.

## Driving it with dms-control

```bash
dms-control journey "$RUN" block-preview [journey-id...]
```

Evidence is under `$RUN/evidence/block-preview/<journey>/`.

## Gotchas

- The page is enabled because the playground sets `docsPreview: true`. The development-mode and `DMS_DOCS_PREVIEW` gates are not driven.
- The Form starter does not draw: `/dms-preview` answers a 500 error page ("Cannot read properties of undefined (reading 'map')"). `preview-renders-every-starter` lists `the Form starter draws` in its `knownFailures`.
