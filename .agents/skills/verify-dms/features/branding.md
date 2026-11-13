---
covers:
  - packages/dms/src/branding/**
  - packages/dms/frontend-vue/layers/dms-layout/app/build/branding/**
docs:
  - packages/dms/docs/05.extending-the-dashboard/04.theming-and-branding.md
---

# Branding

In development, the platform owner edits the platform's theme (colors, corners, font, logos) from the Branding editor at `/branding`, opened by an icon in the dashboard header. Save writes the project's theme files through the builder's theme operations, and `/api/branding/theme` (GET and PUT) and `/api/branding/theme/layer` (POST) are what the editor calls. Outside development none of it exists.

## Sub-features

- `branding-absent-outside-dev`: Exposure: a backend started from a build answers 404 on `GET` and `PUT /api/branding/theme` and on `POST /api/branding/theme/layer`, so no theme file can be read or written.

## How to get to it (user POV)

- Run the project with `ajs project run` (development) as the platform owner, and select the Branding icon in the header.

## Driving it with dms-control

```bash
dms-control journey "$RUN" branding [journey-id...]
```

Evidence is under `$RUN/evidence/branding/<journey>/`.

## Gotchas

- `branding-absent-outside-dev` sets `backend: "production"`, so it passes in any run. To drive the editor by hand, run `dms-control up --dev-backend` and sign the browser in as the administrator first: the page refuses anyone else.
