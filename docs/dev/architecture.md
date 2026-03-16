# Architecture

## System Overview

TacticsCanvas is a monolithic local web application for creating and reviewing tactical map metadata sidecars.

The long-term architectural requirement is that the sidecar format be universal across multiple applications, particularly a virtual tabletop. TacticsCanvas should be one producer/editor/consumer of that contract, not the owner of a private incompatible format.

That universality should apply across games as well as apps. The core sidecar should describe tactical facts about the map, while each game system interprets those facts according to its own rules.

The likely hosted deployment target is a split frontend/backend model:

- Vercel for the frontend application
- Render for backend/API and durable service logic

Current runtime flow:

1. `node server.js` starts an Express server.
2. The server serves the static frontend from `/public`.
3. Users upload map images into `data/maps`.
4. The server loads or creates a `.tactical-map.json` sidecar.
5. The frontend renders the image plus grid overlay in a canvas.
6. Users edit human labels, review AI labels, and save metadata.
7. The server persists sidecars and appends AI usage logs.

## Current Components

### Backend

[server.js](/home/witschey/TacticsCanvas/server.js) currently owns all backend responsibilities:

- static file serving
- file upload handling via `multer`
- sidecar normalization into the legacy runtime shape
- case summary aggregation
- OpenAI request construction and response parsing
- AI usage logging

Key routes:

- `GET /health`
- `GET /api/maps`
- `GET /api/case-summary`
- `POST /api/upload-map`
- `GET /api/metadata/:imageName`
- `POST /api/metadata/:imageName`
- `POST /api/draft-blocking`

### Frontend

[public/index.html](/home/witschey/TacticsCanvas/public/index.html) provides a single-page operator UI with three main surfaces:

- control and workflow panel
- metadata JSON panel
- canvas map panel

[public/app.js](/home/witschey/TacticsCanvas/public/app.js) currently owns:

- UI state
- canvas rendering
- editing tools
- workflow controls
- API calls
- prompt preview construction
- client-side metadata synchronization

### Shared Metadata Helper

[public/mapMetadata.js](/home/witschey/TacticsCanvas/public/mapMetadata.js) is the beginning of a cleaner shared contract. It provides:

- normalization from legacy sidecars
- validation of normalized objects
- serialization back to persisted format
- extension support for app-specific layers

This file is strategically important, but the rest of the app has not fully converged on it yet.

Recommended role for this module:

- canonical normalization/serialization layer for the shared sidecar contract
- reusable by TacticsCanvas and downstream consumers
- strict separation between universal schema fields and app-specific extensions

## Data Model

### Architectural requirement

The sidecar should be split conceptually into:

- universal tactical metadata that any consumer can understand
- optional namespaced extensions for application-specific state
- optional ruleset adapters or ruleset-specific interpretation layers

The universal portion should be safe to hand to a VTT without bringing along review-dashboard assumptions from TacticsCanvas.
It should also be safe to hand to different game systems without forcing one system's vocabulary into the base schema.

### Semantic layering

The architecture should distinguish three levels:

- geometry and map facts:
  - grid
  - boundaries
  - elevation bands
  - traversability hints
  - visibility/obscuration hints
- app workflow state:
  - review status
  - labeler notes
  - AI draft provenance
- game interpretation:
  - D&D 5e cover outcomes
  - system-specific movement penalties
  - ruleset-specific hazard logic

Recommended rule:

- the universal sidecar stores map facts
- TacticsCanvas stores review workflow separately or in namespaced extensions
- game engines derive mechanics from the facts using adapters

### Persisted sidecar shape in active use

Persisted data today is effectively:

- `schema_version`
- `purpose`
- `map`
- `grid`
- `layers.blocking`
- `layers.ai_blocking`
- `layers.ambiguous`
- `ai_annotation`
- `label_source`
- `case_metadata`

### Emerging canonical model

The helper introduces a more structured internal shape:

- `schemaVersion`
- `map.id`
- `grid.tileSizePx`
- `calibration`
- `annotation.ai`
- `annotation.review`
- `extensions`

Recommended direction:

- use the normalized/helper model as the canonical in-memory shape
- serialize to one persisted schema intentionally
- keep legacy import support during migration
- reserve app-specific fields for namespaced extensions rather than the universal core
- reserve game-specific mechanics for ruleset adapters rather than the universal core

## Storage Layout

- Source maps and sidecars: [data/maps](/home/witschey/TacticsCanvas/data/maps)
- AI request logs: [data/logs/ai-draft-log.ndjson](/home/witschey/TacticsCanvas/data/logs/ai-draft-log.ndjson)

Current characteristics:

- local filesystem only
- synchronous reads/writes
- no database
- no object storage
- no job queue

This is fine for the current single-user/local labeling workflow.

## AI Drafting Path

The AI drafting path is straightforward:

1. Frontend sends current metadata and selected model.
2. Backend maps UI model names to API model names.
3. Backend loads the referenced image from disk and converts it to a data URL.
4. Backend sends a structured `responses.create` request with a JSON schema constraint.
5. Backend normalizes the returned blocking grid.
6. Backend stores the draft in `layers.ai_blocking`.
7. Backend logs usage metrics to NDJSON.

Strengths:

- constrained output format
- narrow prompt scope
- visible prompt for human auditing

Weaknesses:

- no retry/backoff strategy
- no dataset-level draft orchestration
- no quality scoring or reviewer feedback loop

## Current Architectural Risks

### UI/runtime coupling

The frontend directly mutates persistence-shaped JSON. That makes it harder to evolve the schema safely.

### Duplication

Grid sizing and comparison logic exist in both client and server. That increases drift risk.

### Monolith concentration

`server.js` and `public/app.js` each contain multiple concerns. The code is still small, but future work will become slower unless responsibilities are split.

### Private-tool assumptions

The current design assumes trusted users, local storage, and low concurrency. That is reasonable now, but should remain explicit.

## Target Architecture

The next stable architecture should still stay lightweight:

### Backend target

- `server/metadata.js`: normalization, validation, serialization
- `server/maps.js`: map listing, upload, path safety
- `server/draft.js`: OpenAI drafting and logging
- `server/summary.js`: case metrics
- `server/app.js` or `server.js`: route wiring only

This backend should be deployable as a Render service and should own:

- persistence-facing APIs
- AI drafting
- authentication/authorization for shared deployments
- publish/release operations
- audit/event logging

### Frontend target

- `public/state.js`: app state and mutations
- `public/render.js`: canvas drawing and UI render helpers
- `public/workflow.js`: case navigation and reviewer actions
- `public/api.js`: fetch wrappers
- `public/metadata.js`: adapter around `MapMetadata`

This frontend should be deployable to Vercel and should avoid depending on local writable filesystem behavior.

### Data target

- one canonical normalized in-memory schema
- one documented persisted schema
- one universal core contract usable across multiple apps
- app-specific extensions with clear namespacing rules
- ruleset-specific interpretation layers built on top of the core
- fixture files for legacy and current sidecars

Likely production storage implication:

- published sidecars and map assets should live in durable storage
- mutable review/session state should live in a durable store accessible to the Render backend

## Non-Goals

For now, the architecture should not optimize for:

- multi-tenant SaaS deployment
- collaborative real-time editing
- full VTT gameplay runtime
- generalized GIS-style map editing

The right next step is "robust labeling workstation," not "platform rewrite."

It should, however, optimize for interoperability. That means schema decisions should be judged partly by whether a separate VTT team could implement the sidecar without importing TacticsCanvas workflow concepts.

They should also be judged by whether two different game systems could consume the same sidecar and apply different rules without needing different base file formats.
