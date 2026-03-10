# Tactical Map Metadata Editor

A browser-based editor for adding tactical metadata to tabletop RPG battle maps.

This project is **not** a virtual tabletop. It is a companion tool for preparing map metadata that a VTT can consume later.

The current MVP focuses on a single tactical layer: **blocking / impassable tiles**.

<img width="1905" height="983" alt="image" src="https://github.com/user-attachments/assets/670fff87-a616-444d-b48b-5ce6d274d40b" />
**Tactical Map Metadata Editor interface.** The web-based editor displays a battle map on the right with a square grid and a semi-transparent red overlay marking tiles labeled as blocking or impassable. The left control panel supports map upload, OpenAI model selection, AI-assisted metadata drafting, and JSON save/export, while a live metadata viewer below shows the current map schema, grid calibration, and blocking layer. This interface is designed for human-in-the-loop review and correction of AI-generated tactical map metadata before downstream use in a virtual tabletop system.


## Why this exists

Most digital battle maps are just images. They look great, but they do not encode tactical information like:

- walls and barriers
- impassable terrain
- movement constraints

This editor adds that missing metadata layer.

You upload a map image, review or create a matching sidecar JSON file, optionally ask OpenAI to draft a blocking grid, then refine the result by hand. The finalized metadata can later be loaded by a separate VTT.

## Current features

- Upload a battle map image
- Load existing sidecar JSON metadata, or create it automatically
- Generate a default square grid from image aspect ratio
- Pan with left-click drag
- Zoom with mouse wheel
- Toggle blocking tiles with right click
- View and edit metadata as JSON
- Draft blocking tiles with OpenAI
- Log model usage, token counts, and turnaround time

## Current scope

This MVP supports:

- square grids only
- bottom-left grid origin
- blocking tiles only

It does **not** yet support:

- difficult terrain
- cover
- hazards
- elevation
- doors as a separate layer
- edge-based wall metadata
- full VTT gameplay

## Grid behavior

The grid is constrained by image aspect ratio.

Rule:

- the larger image dimension is capped at **40 tiles**
- the smaller dimension is scaled proportionally

Examples:

- `2000 x 1000` → `40 cols x 20 rows`
- `1000 x 2000` → `20 cols x 40 rows`
- `1600 x 1600` → `40 cols x 40 rows`

`tile_size_px` is calculated from the row and column counts and is shown in the UI as a derived field.

## Metadata format

Each map image can have a matching sidecar file:

- `crypt-map.png`
- `crypt-map.tactical-map.json`

Example schema:

```json
{
  "schema_version": "0.1.0",
  "purpose": "tactical_map_metadata",
  "map": {
    "name": "example-map.png",
    "image_ref": "example-map.png",
    "image_width_px": 1600,
    "image_height_px": 900
  },
  "grid": {
    "type": "square",
    "origin": "bottom_left",
    "tile_size_px": 40,
    "rows": 23,
    "cols": 40
  },
  "layers": {
    "blocking": [
      [false, false, false],
      [true, false, false],
      [true, true, false]
    ]
  },
  "ai_annotation": {
    "status": "drafted",
    "model": "gpt-4.1-mini",
    "scope": "blocking_only",
    "notes": []
  }
}
```

### Grid indexing

- `row 0` = bottom row
- `col 0` = leftmost column

This convention is used throughout the UI and AI workflow.

## OpenAI drafting

The app can send the uploaded image and current grid metadata to OpenAI to draft blocking tiles.

The AI task is intentionally narrow:

- detect clearly impassable walls and barriers
- return a strict blocking matrix
- prefer `false` when uncertain

The full transmitted prompt is shown in the UI after each draft.

## Logging

Each draft request is logged to:

```text
data/logs/ai-draft-log.ndjson
```

Log entries include:

- requested model
- model used
- turnaround time
- input tokens
- output tokens
- total tokens
- blocking tile count after draft

## Project structure

```text
tactical-map-editor/
  package.json
  server.js
  README.md
  data/
    maps/
    logs/
  public/
    index.html
    styles.css
    app.js
```

## Setup

### Requirements

- Node.js 18+
- npm
- OpenAI API key

### Install

```bash
npm install
```

Or explicitly:

```bash
npm install express multer openai
```

### Set API key

PowerShell:

```powershell
setx OPENAI_API_KEY "your_api_key_here"
```

Then reopen the terminal.

### Run

```bash
node server.js
```

Open:

```text
http://localhost:3000
```

## Health check

```text
http://localhost:3000/health
```

Example response:

```json
{
  "ok": true,
  "app": "tactical-map-editor",
  "ai": "openai"
}
```

## Main endpoints

- `POST /api/upload-map` — upload image and load or create metadata
- `GET /api/metadata/:imageName` — load sidecar JSON
- `POST /api/metadata/:imageName` — save sidecar JSON
- `POST /api/draft-blocking` — send current map to OpenAI for blocking draft

## Design philosophy

This editor is intentionally separate from the VTT.

The editor handles:

- map ingestion
- metadata creation
- AI-assisted drafting
- human review

The VTT later handles:

- gameplay
- movement constraints
- rendering finalized metadata
- tactical AI behavior

That separation keeps the tool focused and makes the metadata reusable.

## Roadmap

Likely next steps:

- paint vs erase mode
- undo / redo
- door layer
- ambiguity / confidence reporting
- cover and difficult terrain layers
- schema validation
- import/export bundles instead of simple sidecars

## Status

MVP, but already usable.

Current workflow:

1. upload image  
2. load or create metadata  
3. review grid  
4. draft blocking with AI  
5. edit by hand  
6. save finalized sidecar JSON

