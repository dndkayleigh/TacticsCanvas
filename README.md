# Tactical Map Editor

A local-first, browser-based tactical map metadata editor for tabletop RPG battle maps.

This project is designed to solve a specific problem in virtual tabletop workflows: battle maps are usually just images. They look great, but they do not explicitly describe the tactical information a game engine, AI agent, or rules-aware assistant needs in order to reason about the environment.

**Tactical Map Editor** adds that missing semantic layer.

It lets you load a map image, define or refine grid alignment, annotate tactical terrain, draw barriers between cells, place tactical objects, and export structured metadata that can later be consumed by a VTT, a simulation engine, or an AI-driven tactical controller.

---

## Why this exists

Most digital battle maps are visually rich but structurally dumb.

A human can look at a map and immediately infer things like:

* this wall blocks movement and line of sight
* this rubble probably counts as difficult terrain
* this pillar provides full cover
* this low wall might provide three-quarter cover
* this doorway connects two rooms and may be open or closed

A machine cannot rely on those assumptions unless the map is paired with structured data.

This editor is built around that idea:

> A battle map should be more than an image. It should be an image plus tactical metadata.

That metadata can then support:

* virtual tabletops
* automated encounter logic
* movement and line-of-sight queries
* AI monster tactics
* AI player-agent planning
* map analysis and validation tools

---

## Core concept

The editor separates the tactical representation into three layers:

### 1. Tiles / cells

Used for area-based semantics such as:

* difficult terrain
* water
* hazards
* elevated terrain
* blocked regions

### 2. Edges

Used for boundary semantics between adjacent cells such as:

* walls
* doors
* windows
* fences
* low walls

### 3. Objects

Used for discrete tactical features placed on the map such as:

* pillars
* statues
* trees
* boulders
* tables
* crates

This combination is much more expressive than tile painting alone and much closer to the way players and GMs actually reason about tactical spaces.

---

## Current feature set

### Map editing

* Upload a raster battle map image
* Display the map on the right side of the application
* Keep tools and controls on the left side for a focused editing workflow
* Export metadata as JSON
* Save metadata through the Node backend

### Navigation and view control

* Mouse wheel zoom
* Pan with middle mouse drag
* Pan with `Space + drag`
* Reset view button
* Live zoom percentage display

### Grid controls

* Set tile size in pixels
* Set grid origin X/Y
* See live grid dimensions
* Ask OpenAI to suggest an initial grid alignment
* Review the suggestion before applying it

### Tactical editing

* Paint tile-level terrain semantics
* Erase tile annotations
* Draw edge-level barriers
* Erase edge annotations
* Place tactical objects
* Remove tactical objects

### Validation and export

* Validate metadata structure on the backend
* Detect out-of-bounds edges and objects
* Detect invalid terrain dimensions
* Detect duplicate object IDs
* Download metadata locally
* Save metadata to `data/exports/`

### AI-assisted setup

* Send the uploaded map image to the backend
* Call the OpenAI API from the server
* Request a proposed initial grid:

  * grid type
  * tile size
  * origin
  * confidence
  * rationale
  * assumptions
* Review the result and apply it manually

---

## Architecture

This project intentionally uses a simple, local-first architecture.

### Frontend

The frontend is a plain browser application served as static files:

* `public/index.html`
* `public/styles.css`
* `public/app.js`

The browser handles:

* rendering the map
* drawing overlays
* user interaction
* zoom and pan
* editing tiles, edges, and objects
* previewing metadata

### Backend

The backend is a small Node/Express server:

* `server.js`

The server handles:

* static file serving
* metadata validation
* server-side export to disk
* OpenAI API calls for initial grid suggestion

### Why this stack

This project deliberately avoids framework overhead in the starter version.

The goal is to provide something that is:

* easy to understand
* easy to run locally
* easy to modify
* easy to extend into AI-assisted workflows

For a canvas-heavy editor like this, plain JavaScript plus a small backend is often the fastest path to a useful tool.

---

## Project structure

```text
 tactical-map-editor/
   package.json
   server.js
   public/
     index.html
     styles.css
     app.js
   data/
     exports/
```

---

## Tactical metadata model

The editor currently works with a tactical metadata object shaped around a few core ideas:

* `map` describes the source image
* `grid` defines tile size, origin, and dimensions
* `layers.terrain` stores tile-level terrain classes
* `edges` stores adjacency-based tactical barriers
* `objects` stores discrete tactical props
* `defaults` describes baseline assumptions for unannotated space
* `ai_annotation` stores model-assisted provenance

At a high level, the saved JSON looks like this:

```json
{
  "schema_version": "0.1.0",
  "map": {
    "id": "crypt_map",
    "name": "crypt-map.png",
    "image_ref": "crypt-map.png",
    "image_width_px": 2800,
    "image_height_px": 2100
  },
  "grid": {
    "type": "square",
    "units_per_tile": 5,
    "units_label": "ft",
    "tile_size_px": 70,
    "origin_px": { "x": 0, "y": 0 },
    "dimensions_tiles": { "cols": 40, "rows": 30 }
  },
  "defaults": {
    "passable": true,
    "movement_cost": 1,
    "vision_blocking": false,
    "cover": "none",
    "terrain": "open"
  },
  "layers": {
    "terrain": [["open", "difficult", "open"]]
  },
  "edges": [
    {
      "a": { "r": 5, "c": 8 },
      "b": { "r": 5, "c": 9 },
      "type": "wall",
      "passable": false,
      "vision_blocking": true,
      "cover": "full"
    }
  ],
  "objects": [
    {
      "id": "pillar_1",
      "type": "pillar",
      "anchor": { "r": 9, "c": 14 },
      "footprint": [{ "r": 9, "c": 14 }],
      "passable": false,
      "vision_blocking": true,
      "cover": "full"
    }
  ],
  "ai_annotation": {
    "status": "none",
    "model": null,
    "confidence_summary": null,
    "notes": []
  }
}
```

---

## Editing workflow

A typical editing session looks like this:

1. Start the local server
2. Open the editor in the browser
3. Upload a map image
4. Ask the AI to suggest a starting grid
5. Review and apply the grid if it looks correct
6. Adjust tile size or origin manually if needed
7. Paint terrain semantics
8. Draw edge-based barriers like walls and doors
9. Place tactical objects such as pillars or boulders
10. Validate the metadata
11. Download or save the final JSON

This is intentionally a **human-in-the-loop** workflow.

The AI is not treated as authoritative. It provides a draft suggestion that the human can confirm or correct.

---

## AI-assisted grid suggestion

One of the most useful onboarding features in the project is the initial grid suggestion flow.

After a map is uploaded, the frontend can send the image to the backend. The backend then calls the OpenAI API and asks the model to estimate:

* whether the map appears square or hex-based
* the likely tile size in pixels
* the most likely X/Y origin
* a confidence estimate
* assumptions made by the model
* a short rationale

This makes setup faster, especially when a map’s grid is subtle, partially hidden, or implied rather than explicit.

### Why the API call is server-side

The OpenAI request is made by the Node backend, not by the browser.

That design keeps the API key out of client-side code and makes it easier to evolve the integration later.

---

## Installation

### Requirements

* Node.js 18 or newer recommended
* npm
* an OpenAI API key for AI-assisted grid suggestion

### Install dependencies

```bash
npm install
```

### Start the app

```bash
npm start
```

Open the editor at:

```text
http://localhost:3000
```

---

## OpenAI configuration

To use the **Suggest Grid** feature, set your API key before starting the server.

### macOS / Linux

```bash
export OPENAI_API_KEY=your_key_here
npm start
```

### Windows PowerShell

```powershell
$env:OPENAI_API_KEY="your_key_here"
npm start
```

If the key is not set, the editor still works, but the grid suggestion endpoint will return an error until the environment variable is configured.

---

## Controls

### View navigation

* **Mouse wheel**: zoom in and out
* **Middle mouse drag**: pan the canvas
* **Space + drag**: pan the canvas
* **Reset View**: restore default zoom and pan

### Editing

* **Left mouse button**: apply the current tool
* **Paint Tiles**: assign tile-level terrain semantics
* **Erase Tiles**: clear tile-level terrain annotations
* **Draw Edges**: add a wall/door/window/low-wall/fence between cells
* **Erase Edges**: remove an edge feature
* **Place Objects**: place a tactical object in a tile
* **Erase Objects**: remove a tactical object

---

## Backend API

The current server exposes a small, useful set of endpoints.

### `GET /api/health`

Simple health check.

**Response**

```json
{ "ok": true }
```

### `POST /api/validate`

Validate the current metadata object.

**Request body**

* tactical metadata JSON

**Response**

```json
{
  "valid": true,
  "errors": []
}
```

### `POST /api/export`

Validate and write metadata to disk.

**Request body**

* tactical metadata JSON

**Response**

```json
{
  "ok": true,
  "fileName": "crypt-map.tactical-map.json",
  "path": ".../data/exports/crypt-map.tactical-map.json"
}
```

### `POST /api/suggest-grid`

Ask OpenAI to estimate a plausible initial grid.

**Request body**

```json
{
  "imageDataUrl": "data:image/png;base64,...",
  "imageName": "crypt-map.png",
  "imageWidth": 2800,
  "imageHeight": 2100
}
```

**Response**

```json
{
  "ok": true,
  "suggestion": {
    "grid_type": "square",
    "tile_size_px": 70,
    "origin_x": 0,
    "origin_y": 0,
    "confidence": 0.91,
    "rationale": "Visible square grid lines align at roughly 70 pixels.",
    "assumptions": ["Grid appears embedded in the image"]
  }
}
```

---

## Design principles

This project is built around a few practical principles.

### Local-first

You should be able to run the editor on your own machine without deploying infrastructure.

### Human-review-first

AI suggestions are useful, but tactical map semantics should remain reviewable and editable by a human.

### Tactical semantics should be explicit

The image alone is not enough. The metadata should make movement, cover, line of sight, and obstacles machine-readable.

### Keep the editor independent from the VTT

This project is not trying to be a VTT. It is an authoring and metadata tool that other systems can consume.

---

## Current limitations

This is an early but functional starter. A few limitations are intentional at this stage.

* JSON import is not yet implemented in the browser UI
* validation is hand-written rather than powered by a full JSON Schema validator
* object footprints are currently single-tile only
* AI currently suggests grid alignment only, not terrain, edges, or objects
* there is no undo/redo stack yet
* there is no dedicated rules-engine layer for cover or line-of-sight queries yet

---

## Recommended next steps

The strongest next additions would be:

### 1. JSON import

Load previously-authored metadata and continue editing.

### 2. JSON Schema validation with Ajv

Replace the hand-written validator with a formal schema validator.

### 3. Multi-tile objects

Support larger footprints for statues, long tables, wagons, or room-sized objects.

### 4. AI semantic annotation

Extend AI assistance beyond grid detection into:

* terrain classification
* wall and doorway suggestions
* cover-producing object suggestions
* hazard and elevation suggestions

### 5. Runtime query helpers

Add a layer that a VTT can consume directly, with functions such as:

* `isPassable(cell)`
* `movementCost(cell)`
* `blocksVision(edge)`
* `coverBetween(a, b)`

### 6. Rule-system adapters

Keep the metadata system-agnostic, but provide translators for specific games.

---

## Who this is for

This project is especially useful for:

* VTT developers
* GMs building tactical automation tools
* AI-assisted encounter designers
* researchers exploring structured semantic representations for maps
* developers experimenting with machine-readable tactical environments

---

## Vision

The long-term vision is simple:

> Battle maps should be portable, structured tactical spaces—not just pictures.

A map image plus rich metadata can become a shared substrate for:

* human play
* digital adjudication
* AI tactical reasoning
* map analytics
* rules-aware simulation

This starter is the first layer of that system.

---

## Contributing

This project is at a prototyping stage, so contributions are most helpful when they improve one of the following:

* metadata clarity
* editing ergonomics
* validation rigor
* AI-assisted annotation workflows
* VTT interoperability

Suggested areas of contribution:

* JSON import/export refinement
* schema formalization
* UI polish
* canvas interaction improvements
* backend AI integration hardening
* performance optimization for large maps

---

## License

No license has been assigned yet.

If you plan to publish or share this project, add an explicit license such as MIT, Apache-2.0, or GPL depending on your intended usage model.

---

## Summary

**Tactical Map Editor** is a lightweight local tool for turning battle map images into structured tactical data.

It already supports:

* tile annotations
* edge annotations
* object placement
* zoom and pan
* backend validation
* local export
* OpenAI-assisted initial grid suggestion

It is intended as a foundation for a broader ecosystem in which battle maps can be edited once and then reused across VTTs, rules engines, and AI tactical systems.
