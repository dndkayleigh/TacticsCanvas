# Tactical Map Sidecar Schema

## Status

Draft specification for a universal tactical map sidecar.

This document defines a shared sidecar format intended to be:

- application-neutral
- game-neutral
- grid-aware
- edge-first for blocking boundaries

TacticsCanvas is one producer/editor of this format. A virtual tabletop, encounter simulator, or other map-analysis tool should also be able to consume it without inheriting TacticsCanvas-specific workflow assumptions.

## Design Goals

The schema should:

- describe tactical facts about a map, not the rules of a specific game
- support edge-based blocking as the canonical wall/barrier model
- allow future tactical semantics beyond blocking
- allow different games to interpret the same map data differently
- separate universal tactical metadata from app-specific workflow metadata
- support forward-compatible extensions

## Non-Goals

The universal core should not directly encode:

- D&D 5e-specific terms like `half_cover`
- per-application review workflow state
- full encounter state such as initiative, tokens, or HP
- real-time editing/session state

Those belong in adapters or namespaced extensions.

## Versioning

This draft proposes a breaking-format version:

- `schema_version: "2.0.0"`

Rationale:

- earlier project data is tile-blocking based
- this draft moves the canonical wall model to edge-based boundaries
- this draft formalizes extension boundaries for app-specific and ruleset-specific data

## Core Model

### Top-Level Shape

```json
{
  "schema_version": "2.0.0",
  "purpose": "tactical_map_metadata",
  "map": {},
  "grid": {},
  "calibration": {},
  "tactical": {},
  "extensions": {}
}
```

### Required Top-Level Fields

- `schema_version`
- `purpose`
- `map`
- `grid`
- `tactical`

### Optional Top-Level Fields

- `calibration`
- `extensions`

## Top-Level Fields

### `schema_version`

String semantic version of the persisted sidecar contract.

Example:

```json
"schema_version": "2.0.0"
```

### `purpose`

Must equal:

```json
"tactical_map_metadata"
```

### `map`

Describes the source image identity.

```json
{
  "id": "crumbling-gate",
  "name": "Crumbling Gate",
  "image_ref": "crumbling-gate-nogrid.png",
  "image_width_px": 13200,
  "image_height_px": 10200
}
```

Fields:

- `id`: stable string identifier for the map
- `name`: human-readable name
- `image_ref`: image filename, URL, or application-specific asset reference
- `image_width_px`: integer > 0
- `image_height_px`: integer > 0

### `grid`

Defines the tactical grid used by the sidecar.

```json
{
  "type": "square",
  "origin": "bottom_left",
  "rows": 31,
  "cols": 40,
  "tile_size_px": 330,
  "suggested_tile_size_px": 330,
  "alignment": {
    "grid_anchor_px": { "x": 0, "y": 0 },
    "grid_rotation_deg": 0
  }
}
```

Fields:

- `type`: currently `"square"`
- `origin`: currently `"bottom_left"`
- `rows`: integer > 0
- `cols`: integer > 0
- `tile_size_px`: integer > 0
- `suggested_tile_size_px`: optional integer > 0 for consumers that want an author-recommended rendered tile size
- `alignment`: optional grid-alignment hints

`alignment` fields:

- `grid_anchor_px.x`: x pixel anchor for the grid origin on the source image
- `grid_anchor_px.y`: y pixel anchor for the grid origin on the source image
- `grid_rotation_deg`: optional grid rotation hint

Interpretation guidance:

- `tile_size_px` is the canonical tile size implied by the current grid definition
- `suggested_tile_size_px` is an optional authoring/presentation hint for consumers that may support alternate rendering or import workflows
- `alignment` helps consumers align the grid overlay to the image consistently, especially during import or visual calibration

Notes:

- This draft is square-grid only.
- Hex support can be added in a future major/minor revision.

### `calibration`

Optional rendering/alignment hints for consumers that need them.

```json
{
  "map_offset_px": { "x": 0, "y": 0 },
  "map_scale": 1.0,
  "map_rotation_deg": 0,
  "map_opacity": 1.0
}
```

These are presentation hints, not core tactical facts.

Recommended distinction:

- put grid-definition and grid-alignment hints in `grid`
- put viewer/renderer calibration hints in `calibration`

In practice:

- `grid.alignment` answers "where is the tactical grid anchored on the map image?"
- `calibration` answers "how should this specific consumer render or align the image asset?"

### `tactical`

Contains universal tactical map facts.

```json
{
  "boundary_layers": {},
  "cell_layers": {}
}
```

At minimum, `tactical.boundary_layers.blocking` is expected for blocking-aware consumers.

## Coordinate System

The schema uses bottom-left indexing.

- cell row `0` is the bottom row
- cell col `0` is the leftmost column

Grid vertex coordinates are defined on integer lattice points:

- x from `0` to `cols`
- y from `0` to `rows`

Cells occupy:

- cell `(r, c)` spans x `[c, c+1]` and y `[r, r+1]`

## Boundary Layers

Boundary layers describe edge-based facts between cells or around map perimeter.

### Topology

Boundary layers use `edge_matrix` topology and consist of:

- `horizontal`: `(rows + 1) x cols`
- `vertical`: `rows x (cols + 1)`

### Boundary Segment Meaning

- `horizontal[y][x]` is the horizontal segment from vertex `(x, y)` to `(x + 1, y)`
- `vertical[y][x]` is the vertical segment from vertex `(x, y)` to `(x, y + 1)`

Perimeter edges are included:

- `horizontal[0][x]`: south perimeter
- `horizontal[rows][x]`: north perimeter
- `vertical[y][0]`: west perimeter
- `vertical[y][cols]`: east perimeter

### Boundary Layer Shape

```json
{
  "semantic": "core.blocking",
  "topology": "edge_matrix",
  "value_type": "boolean",
  "default": false,
  "horizontal": [],
  "vertical": []
}
```

Fields:

- `semantic`: semantic identifier
- `topology`: must be `"edge_matrix"`
- `value_type`: currently one of `"boolean"`, `"number"`, `"string"`
- `default`: default value implied when data is absent
- `horizontal`: edge matrix
- `vertical`: edge matrix

### Canonical Core Boundary Semantics

These are recommended core semantic ids:

- `core.blocking`
  - `true` means movement through the boundary is blocked
- `core.visibility_blocking`
  - `true` means line of sight/effect is blocked by the boundary
- `core.interaction_boundary`
  - string enum such as `"none"`, `"door"`, `"window"`, `"gate"`

Consumers may ignore semantics they do not understand.

### Example: Blocking Layer

```json
{
  "semantic": "core.blocking",
  "topology": "edge_matrix",
  "value_type": "boolean",
  "default": false,
  "horizontal": [
    [true, true],
    [false, false],
    [true, false]
  ],
  "vertical": [
    [true, false, true],
    [true, true, false]
  ]
}
```

For a `2 x 2` grid:

- `horizontal` has `3 x 2`
- `vertical` has `2 x 3`

## Cell Layers

Cell layers describe facts that belong to cell interiors rather than boundaries.

### Topology

Cell layers use `cell_matrix` topology and consist of:

- `rows`: `rows x cols`

### Cell Layer Shape

```json
{
  "semantic": "core.traversal_cost",
  "topology": "cell_matrix",
  "value_type": "number",
  "default": 1.0,
  "rows": []
}
```

Fields:

- `semantic`: semantic identifier
- `topology`: must be `"cell_matrix"`
- `value_type`: currently one of `"boolean"`, `"number"`, `"string"`
- `default`: default value implied when data is absent
- `rows`: cell matrix

### Canonical Core Cell Semantics

These are recommended core semantic ids:

- `core.traversal_cost`
  - numeric movement multiplier or relative movement cost
- `core.obscuration`
  - string enum such as `"none"`, `"light"`, `"heavy"`
- `core.elevation`
  - numeric elevation band or height value
- `core.occupancy`
  - string enum such as `"empty"`, `"solid_object"`, `"difficult_object"`

These are map facts, not game mechanics.

Example:

- a game may interpret `core.obscuration = "light"` as partial concealment
- another game may ignore it entirely

## Tactical Object Containers

The universal core may expand later to support object-level metadata, but this draft keeps the minimum contract simple:

- boundaries for edge facts
- cells for area facts

If object-specific metadata is needed before the core formally adds it, use a namespaced extension.

## `tactical` Shape

Recommended shape:

```json
{
  "boundary_layers": {
    "blocking": {},
    "visibility_blocking": {}
  },
  "cell_layers": {
    "traversal_cost": {},
    "obscuration": {}
  }
}
```

Layer object keys like `blocking` and `traversal_cost` are local convenience keys. Their normative meaning comes from each layer's `semantic` field.

## Extensions

`extensions` is the only approved place for application-specific or ruleset-specific metadata that is not part of the universal core.

### Rules

- Consumers must ignore unknown extension namespaces.
- Extension keys should be namespaced.
- Extensions must not redefine the meaning of core fields.
- Extensions may add derived or consumer-specific meaning.

Recommended namespace styles:

- `tacticsCanvas`
- `dnd5e`
- `pf2e`
- `myVtt`
- reverse-DNS style if needed

### App-Specific Extension Example

```json
{
  "extensions": {
    "tacticsCanvas": {
      "review": {
        "status": "needs_review",
        "labeler": "alice"
      },
      "ai_draft": {
        "notes": ["north wall uncertain"]
      }
    }
  }
}
```

### Ruleset-Specific Extension Example

```json
{
  "extensions": {
    "dnd5e": {
      "derived_cover_hints": {
        "version": "draft",
        "notes": [
          "This data is advisory and derived from universal map facts."
        ]
      }
    }
  }
}
```

Preferred rule:

- store universal map facts in `tactical`
- store workflow in app-specific extensions
- store ruleset-specific derived mechanics in ruleset-specific extensions only when necessary

## Interpretation Guidance

### Universal Core

The core should answer questions like:

- Is this boundary passable?
- Does this cell slow movement?
- Is this area obscured?
- What is the elevation here?

### Game Adapters

A game adapter should answer questions like:

- Does this count as half cover in D&D 5e?
- What is the action cost to open this door in Game X?
- Does heavy obscuration impose concealment penalties in Game Y?

That interpretation should happen outside the universal core.

## Validation Rules

### General

- `purpose` must equal `"tactical_map_metadata"`
- `schema_version` must be a string
- `grid.rows`, `grid.cols`, and `grid.tile_size_px` must be positive integers
- if present, `grid.suggested_tile_size_px` must be a positive integer
- `map.image_width_px` and `map.image_height_px` must be positive integers
- if present, `grid.alignment.grid_anchor_px.x` and `grid.alignment.grid_anchor_px.y` must be numbers
- if present, `grid.alignment.grid_rotation_deg` must be a number

### Boundary Layers

For each boundary layer:

- `topology` must equal `"edge_matrix"`
- `horizontal.length` must equal `grid.rows + 1`
- each `horizontal[row].length` must equal `grid.cols`
- `vertical.length` must equal `grid.rows`
- each `vertical[row].length` must equal `grid.cols + 1`

### Cell Layers

For each cell layer:

- `topology` must equal `"cell_matrix"`
- `rows.length` must equal `grid.rows`
- each `rows[row].length` must equal `grid.cols`

## Minimal Example

This is the smallest useful edge-based blocking sidecar:

```json
{
  "schema_version": "2.0.0",
  "purpose": "tactical_map_metadata",
  "map": {
    "id": "example-map",
    "name": "Example Map",
    "image_ref": "example-map.png",
    "image_width_px": 1600,
    "image_height_px": 900
  },
  "grid": {
    "type": "square",
    "origin": "bottom_left",
    "rows": 2,
    "cols": 3,
    "tile_size_px": 300,
    "suggested_tile_size_px": 300,
    "alignment": {
      "grid_anchor_px": { "x": 0, "y": 0 },
      "grid_rotation_deg": 0
    }
  },
  "tactical": {
    "boundary_layers": {
      "blocking": {
        "semantic": "core.blocking",
        "topology": "edge_matrix",
        "value_type": "boolean",
        "default": false,
        "horizontal": [
          [true, true, true],
          [false, false, false],
          [true, false, true]
        ],
        "vertical": [
          [true, false, false, true],
          [true, true, false, true]
        ]
      }
    },
    "cell_layers": {}
  }
}
```

## Richer Example

```json
{
  "schema_version": "2.0.0",
  "purpose": "tactical_map_metadata",
  "map": {
    "id": "ruined-courtyard",
    "name": "Ruined Courtyard",
    "image_ref": "ruined-courtyard.png",
    "image_width_px": 4000,
    "image_height_px": 3000
  },
  "grid": {
    "type": "square",
    "origin": "bottom_left",
    "rows": 3,
    "cols": 3,
    "tile_size_px": 1000,
    "suggested_tile_size_px": 1000,
    "alignment": {
      "grid_anchor_px": { "x": 24, "y": 18 },
      "grid_rotation_deg": 0
    }
  },
  "tactical": {
    "boundary_layers": {
      "blocking": {
        "semantic": "core.blocking",
        "topology": "edge_matrix",
        "value_type": "boolean",
        "default": false,
        "horizontal": [
          [true, true, true],
          [false, false, false],
          [false, true, false],
          [true, true, true]
        ],
        "vertical": [
          [true, false, false, true],
          [true, true, false, true],
          [true, false, true, true]
        ]
      },
      "interaction": {
        "semantic": "core.interaction_boundary",
        "topology": "edge_matrix",
        "value_type": "string",
        "default": "none",
        "horizontal": [
          ["none", "none", "none"],
          ["none", "door", "none"],
          ["none", "none", "none"],
          ["none", "none", "none"]
        ],
        "vertical": [
          ["none", "none", "none", "none"],
          ["none", "none", "none", "none"],
          ["none", "window", "none", "none"]
        ]
      }
    },
    "cell_layers": {
      "traversal_cost": {
        "semantic": "core.traversal_cost",
        "topology": "cell_matrix",
        "value_type": "number",
        "default": 1.0,
        "rows": [
          [1.0, 1.0, 1.0],
          [1.0, 2.0, 1.0],
          [1.0, 1.0, 1.0]
        ]
      },
      "obscuration": {
        "semantic": "core.obscuration",
        "topology": "cell_matrix",
        "value_type": "string",
        "default": "none",
        "rows": [
          ["none", "none", "none"],
          ["none", "light", "none"],
          ["none", "heavy", "none"]
        ]
      }
    }
  },
  "extensions": {
    "tacticsCanvas": {
      "review": {
        "status": "in_progress",
        "labeler": "alice"
      }
    },
    "dnd5e": {
      "notes": [
        "Consumers may derive cover from walls, windows, and obscuration."
      ]
    }
  }
}
```

## Migration From Legacy Tile Blocking

Legacy files in this project use tile-level blocking matrices.

Migration guidance:

- import legacy `layers.blocking`
- derive perimeter and inter-cell blocking edges where possible
- mark lossy/ambiguous conversions for review
- persist edge-based data in the new core schema
- store any temporary migration notes in an extension, not in the core

Important:

- tile blocking is not equivalent to edge blocking
- some legacy patterns imply occupied/solid cells, not just blocked boundaries
- migration should therefore be treated as assisted conversion, not exact transformation

## Open Questions

These should be resolved before implementation is finalized:

- Should `core.visibility_blocking` be boolean or allow graded opacity?
- Should doors/windows live in a dedicated core semantic or remain interaction-boundary strings?
- Should occupancy be represented as a cell layer, an object layer, or both?
- Should calibration remain in the universal schema or move to an optional extension?
- Should hex grids be a v2 minor extension or a later major revision?

## Recommendation

Implement against this draft with these priorities:

1. core edge blocking
2. extension separation
3. migration tooling
4. generic cell semantics
5. ruleset adapters

That keeps the first interoperable version small while leaving room for richer tactical metadata later.
