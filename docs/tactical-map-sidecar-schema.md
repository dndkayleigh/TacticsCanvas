# Tactical Map Sidecar Schema
Version: 1.0.0

## Purpose

This sidecar file stores durable, portable metadata about a tactical map image so that:

- TacticsCanvas can edit and review map metadata
- DrowVTT can load and use the same metadata at runtime
- map metadata remains separate from gameplay/session state

This file is intended to live next to a map image, for example:

- `crypt-map.png`
- `crypt-map.tactical-map.json`

## Design principles

1. The sidecar describes the map asset, not the battle session.
2. TacticsCanvas is the primary editor for this file.
3. DrowVTT is a consumer of this file and may optionally export it.
4. Unknown future fields should be preserved where possible.
5. Runtime/gameplay data such as tokens, initiative, and turn state must not be stored here.

## Required top-level fields

- `schema_version`
- `purpose`
- `map`
- `grid`
- `layers`

## Canonical JSON shape

```json
{
  "schema_version": "1.0.0",
  "purpose": "tactical_map_metadata",

  "map": {
    "id": "crypt-map",
    "name": "crypt-map.png",
    "image_ref": "crypt-map.png",
    "image_width_px": 1600,
    "image_height_px": 900
  },

  "grid": {
    "type": "square",
    "origin": "bottom_left",
    "rows": 23,
    "cols": 40,
    "tile_size_px": 40
  },

  "calibration": {
    "map_offset_px": { "x": 0, "y": 0 },
    "map_scale": 1.0,
    "map_rotation_deg": 0,
    "map_opacity": 1.0
  },

  "layers": {
    "blocking": [
      [false, false, false],
      [true,  false, false],
      [true,  true,  false]
    ]
  },

  "annotation": {
    "ai": {
      "status": "drafted",
      "model": "gpt-4-mini",
      "scope": "blocking_only",
      "notes": []
    },
    "review": {
      "label_source": "mixed",
      "labeler": "",
      "review_status": "draft",
      "reviewer": null,
      "blocking_rule_version": "v1",
      "created_at": null,
      "updated_at": null,
      "notes": ""
    }
  },

  "extensions": {}
}
