# Current State

## Executive Summary

TacticsCanvas is a small Node/Express application with a browser-based labeling UI for tactical map metadata. It already supports a real end-to-end loop:

- serve a local web app
- upload map images
- create or load sidecar metadata
- draft blocking tiles with OpenAI
- review and edit labels manually
- save sidecars and log AI usage

The project is past "blank prototype" stage, but it is not yet stable enough to treat as a dependable labeling tool. The biggest short-term issue is that the browser app currently has a JavaScript syntax error, which likely prevents the UI from loading at all in its present checked-in state. There is also clear schema drift between the legacy sidecar format used by the server/UI and the newer shared metadata helper.

There is also an important product requirement that is not yet fully reflected in the code or docs: the sidecar needs to be universal across several applications, especially a virtual tabletop. Today the persisted structure still mixes tactical map data with TacticsCanvas-specific review workflow concepts.

There is a second interoperability requirement emerging behind that one: the sidecar likely needs to remain game-neutral. A D&D-specific concept like `half_cover` may be useful to one consumer but too opinionated for the shared base contract.

## What Exists Today

### Application shape

- Backend: single-file Express server in [server.js](/home/witschey/TacticsCanvas/server.js)
- Frontend: static HTML/CSS/JS in [public/index.html](/home/witschey/TacticsCanvas/public/index.html), [public/styles.css](/home/witschey/TacticsCanvas/public/styles.css), and [public/app.js](/home/witschey/TacticsCanvas/public/app.js)
- Shared schema helper: [public/mapMetadata.js](/home/witschey/TacticsCanvas/public/mapMetadata.js)
- Sample assets and sidecars in [data/maps](/home/witschey/TacticsCanvas/data/maps)
- AI request log in [data/logs/ai-draft-log.ndjson](/home/witschey/TacticsCanvas/data/logs/ai-draft-log.ndjson)

### Functional capabilities

- Health endpoint and static serving are in place in [server.js](/home/witschey/TacticsCanvas/server.js#L21)
- Map listing, upload, metadata load/save, case summary, and AI draft endpoints exist in [server.js](/home/witschey/TacticsCanvas/server.js#L290)
- The UI includes:
  - case navigation
  - review dashboard
  - paint/erase/ambiguous/pan modes
  - undo/redo
  - AI draft acceptance/clearing
  - prompt visibility
  - JSON editor
- Sidecar examples already exist for multiple maps in [data/maps](/home/witschey/TacticsCanvas/data/maps)
- AI calls have been exercised with real data, confirmed by [data/logs/ai-draft-log.ndjson](/home/witschey/TacticsCanvas/data/logs/ai-draft-log.ndjson)

## Critical Findings

### 1. Frontend currently fails syntax check

[public/app.js](/home/witschey/TacticsCanvas/public/app.js#L90) destructures `makeGrid` from `window.MapMetadata`, then redeclares `makeGrid` at [public/app.js](/home/witschey/TacticsCanvas/public/app.js#L101). `node --check public/app.js` fails with:

- `SyntaxError: Identifier 'makeGrid' has already been declared`

Impact:

- high confidence the browser bundle does not currently execute
- blocks all UI usage until fixed

### 2. Schema migration is incomplete

The project now contains two metadata models:

- legacy sidecar shape used by the server and most UI code:
  - `schema_version`
  - `map.image_ref`
  - `grid.tile_size_px`
  - `layers.ai_blocking`
  - `label_source`
  - `case_metadata`
- normalized/helper shape in [public/mapMetadata.js](/home/witschey/TacticsCanvas/public/mapMetadata.js#L118):
  - `schemaVersion`
  - `map.imageRef`
  - `grid.tileSizePx`
  - `annotation.review`
  - `extensions`

The helper can translate between old and new shapes, but the main app does not consistently use it. Much of [public/app.js](/home/witschey/TacticsCanvas/public/app.js#L472) still mutates legacy fields directly.

Impact:

- high risk of silent data inconsistency
- future feature work will get slower unless one canonical schema is chosen
- interoperability will remain weak unless app-specific workflow metadata is separated from universal tactical data
- cross-game reuse will remain weak unless the schema focuses on map facts instead of ruleset outcomes

### 3. Documentation materially lags implementation

The README still describes a simpler MVP:

- it says blocking-only MVP
- it omits the review dashboard and ambiguity workflow
- it lists roadmap items that are already implemented, such as paint/erase and undo/redo
- it references docs that are not present in the repository

Impact:

- onboarding friction
- future sessions may make incorrect assumptions
- the repo still lacks a clear standalone schema specification for external consumers

### 4. No automated tests or CI safety net

There are no test files and no test script in [package.json](/home/witschey/TacticsCanvas/package.json). Current verification depends on manual use and ad hoc syntax checks.

Impact:

- regressions can land unnoticed
- schema migration will be risky without fixture tests

### 5. Server-side trust boundaries are weak

The upload and metadata flows are appropriate for a private tool, but not production hardened:

- original filenames are written directly in [server.js](/home/witschey/TacticsCanvas/server.js#L25)
- image dimensions are trusted from client form data in [server.js](/home/witschey/TacticsCanvas/server.js#L341)
- no authentication
- no rate limiting
- synchronous filesystem operations throughout

Impact:

- acceptable for local/single-user use
- not ready for shared or internet-exposed deployment

## Secondary Findings

- The app duplicates utility logic across server and client for grid sizing and comparison metrics.
- The UI is desktop-first and lacks explicit responsive/mobile handling in [public/styles.css](/home/witschey/TacticsCanvas/public/styles.css#L16).
- `public/mapMetadata.js` appears intended for reuse across projects, but that contract is not yet enforced anywhere.
- The current sidecar shape is not yet clearly partitioned into universal fields versus TacticsCanvas-only fields.
- The project has not yet defined which future tactical metadata belongs in a universal semantic layer versus in game-specific interpretation.
- The checked-in `public/mapMetadata.js:Zone.Identifier` file is Windows metadata noise and should not live in source control.
- There is no formal ingestion workflow for batch datasets even though the UI already behaves like a labeling workstation.

## Strengths

- The scope is well chosen: blocking labels first, not "build a whole VTT."
- The implementation is understandable and small enough to refactor safely.
- The user workflow is already recognizable as a real annotation product, not a toy demo.
- The OpenAI integration is narrow and operationally useful.
- Sample data and logs make it easier to build tests next.

## Current Maturity Assessment

- Product maturity: early internal tool
- Code maturity: promising but fragile
- Operational maturity: local/manual only
- Data maturity: enough examples to define fixtures and labeling rules
- Documentation maturity: incomplete and partially outdated

## Immediate Priorities

1. Restore a working frontend by fixing the `makeGrid` redeclaration.
2. Define a universal sidecar contract that cleanly separates shared tactical metadata from TacticsCanvas workflow metadata.
3. Decide which tactical concepts should be stored as game-neutral map facts and which should be left to ruleset interpretation.
4. Choose one canonical metadata schema and convert the app to it intentionally.
5. Add fixture-based tests around sidecar normalization, server endpoints, save/load round trips, cross-application compatibility, and cross-game interpretation.
6. Refresh the main README after the docs in `/docs/dev` are adopted.
