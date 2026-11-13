---
covers:
  - packages/dms/src/mockup/**
  - packages/dms/data/mockup-example/**
  - packages/dms/data/mockup-spec.schema.json
  - packages/dms/scripts/mockup-schema.mjs
  - packages/dms/src/mcp/tools/mockup*.ts
docs:
  - packages/dms/docs/08.ai-and-claude-code/9.mockups.md
---

# Mockups

In development, `mockups/<name>/spec.json` is drawn live on `/mockup?name=<name>`: the backend validates the spec against the registered blocks, watches the file and streams each compiled state to the page, which posts it to a `/dms-preview` frame. `/api/mockup/*` serves the list, the schema, the state stream, the fixtures and the annotations of `mockups/<name>/annotations.json`. Outside development none of it exists.

## Sub-features

- `mockup-absent-outside-dev`: Exposure: a backend started from a build answers 404 on `/api/mockup`, `/api/mockup/schema` and a mockup's annotations, so no file under `mockups/` is read or written.

## How to get to it (user POV)

- Run the project with `ajs project run` (development), write `mockups/<name>/spec.json` in its folder, and open `<dashboard>/mockup?name=<name>`.
- As the platform owner, click the Mockups icon in the header, or open `<dashboard>/mockups`: one card per mockup, the one changed last first, each with a thumbnail of its first page, its page count, open comments, source and status (Draft, or Built with a link to each page of `built.pages`).

## Driving it with dms-control

```bash
dms-control journey "$RUN" mockups [journey-id...]
```

Evidence is under `$RUN/evidence/mockups/<journey>/`.

## Gotchas

- A run's backend is `ajs project start` on a build, so it is not in development and the live journeys cannot run there. To drive `/mockup`, start `ajs project run -e docs` in `$RUN/root/packages/dms/playground` with the backend's environment and a free `PORT`, and write that port into `$RUN/api-target`.
