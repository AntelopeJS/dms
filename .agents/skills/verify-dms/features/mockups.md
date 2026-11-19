---
covers:
  - packages/dms/src/mockup/**
  - packages/dms/data/mockup-example/**
  - packages/dms/data/mockup-spec.schema.json
  - packages/dms/scripts/mockup-schema.mjs
  - packages/dms/src/mcp/tools/mockup*.ts
  - packages/dms/frontend-vue/layers/dms-ui/app/build/components/block-preview/MockupOverview*.vue
docs:
  - packages/dms/docs/08.ai-and-claude-code/9.mockups.md
  - packages/dms/docs/08.ai-and-claude-code/10.mockup-nodes.md
  - packages/dms/docs/08.ai-and-claude-code/11.mockup-controller-blocks.md
  - packages/dms/docs/08.ai-and-claude-code/12.mockup-viewer.md
  - packages/dms/docs/08.ai-and-claude-code/13.mockup-review.md
  - packages/dms/docs/08.ai-and-claude-code/14.mockup-http-api.md
  - packages/dms/docs/08.ai-and-claude-code/17.mockup-annotations.md
---

# Mockups

In development, `mockups/<name>/spec.json` is drawn live on `/mockup?name=<name>`: the backend validates the spec against the registered blocks, watches the file and streams each compiled state to the page, which posts it to a `/dms-preview` frame. `/api/mockup/*` serves the list, the schema, the state stream, the fixtures and the annotations of `mockups/<name>/annotations.json`. The routes and the page serve the platform owner only. Outside development none of it exists.

## Sub-features

- `mockup-absent-outside-dev`: Exposure: a backend started from a build answers 404 on `/api/mockup`, `/api/mockup/schema` and a mockup's annotations, so no file under `mockups/` is read or written.
- `mockup-sample-reads-no-live-route`: Exposure: on a development backend, a mockup whose KPI, chart card and serialized table each name a live route of the playground is opened on `/mockup` with `data=sample`; no request of the page or its frames reads those routes, every API request of the preview frame is a mockup route, the dashboard's own (icons, realtime session, `pages.*` topics, onboarding and system state) or the playground's command palette plugin, and the blocks draw their error state.
- `mockup-overview-labels-stay-in-their-frames`: Layout: on a development backend, a mockup whose hidden sub-page sits between two pages is opened on its Overview and zoomed out notch by notch to the narrowest zoom; at every zoom no part of a frame's label (icon, parent, title, hidden marker, comment count) is painted past its frame's right edge, and the hidden-page marker is painted whole on every frame at least 64 px wide.
- `mockup-owner-only-in-dev`: Access: on a development backend the owner reads the list and the schema, while a caller with no session gets 401 and an invited member gets 403 on every route, the comment write included.

## How to get to it (user POV)

- Run the project with `ajs project run` (development), write `mockups/<name>/spec.json` in its folder, sign in as the platform owner and open `<dashboard>/mockup?name=<name>`.
- As the platform owner, click the Mockups icon in the header, or open `<dashboard>/mockups`: one card per mockup, the one changed last first, each with a thumbnail of its first page, its page count, open comments, source and status (Draft, or Built with a link to each page of `built.pages`).

## Driving it with dms-control

```bash
dms-control journey "$RUN" mockups [journey-id...]
```

Evidence is under `$RUN/evidence/mockups/<journey>/`.

## Gotchas

- Each journey names the backend it needs (`backend: "production"` or `"dev"`), so one run passes both. To drive `/mockup` by hand, run `dms-control up --dev-backend` and sign the browser in as the administrator first: the page refuses anyone else.
