// Shared tactical map sidecar utilities
// Drop this file into TacticsCanvas/public/mapMetadata.js
// or an equivalent location in DrowVTT.
//
// Browser usage:
//   const { normalizeMapMetadata, validateNormalizedMapMetadata, serializeMapMetadata, makeGrid } = window.MapMetadata;
//
// ES module usage (if you later convert to modules):
//   import { normalizeMapMetadata, validateNormalizedMapMetadata, serializeMapMetadata, makeGrid } from "./mapMetadata.js";

(function (global) {
  "use strict";

  function makeGrid(rows, cols, fill) {
    const value = fill === undefined ? false : fill;
    return Array.from({ length: rows }, function () {
      return Array.from({ length: cols }, function () {
        return value;
      });
    });
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function deepClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function toPositiveInt(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
  }

  function toNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function ensureBlockingGrid(grid, rows, cols) {
    if (!Array.isArray(grid) || grid.length !== rows) {
      return makeGrid(rows, cols, false);
    }

    const normalized = [];
    for (let r = 0; r < rows; r++) {
      const row = Array.isArray(grid[r]) ? grid[r] : [];
      const nextRow = [];
      for (let c = 0; c < cols; c++) {
        nextRow.push(Boolean(row[c]));
      }
      normalized.push(nextRow);
    }
    return normalized;
  }

  function defaultCalibration() {
    return {
      mapOffsetPx: { x: 0, y: 0 },
      mapScale: 1.0,
      mapRotationDeg: 0,
      mapOpacity: 1.0
    };
  }

  function defaultAnnotation() {
    return {
      ai: {
        status: null,
        model: null,
        scope: null,
        notes: []
      },
      review: {
        labelSource: null,
        labeler: null,
        reviewStatus: null,
        reviewer: null,
        blockingRuleVersion: null,
        createdAt: null,
        updatedAt: null,
        notes: null
      }
    };
  }

  function slugFromName(name) {
    if (!name || typeof name !== "string") return "untitled-map";
    return (
      name
        .replace(/\.[^.]+$/, "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "untitled-map"
    );
  }

  function extractExtensions(input) {
    const out = {};

    const aiBlocking = input && input.layers && input.layers.ai_blocking;
    const ambiguous = input && input.layers && input.layers.ambiguous;
    if (aiBlocking || ambiguous) {
      out.tacticsCanvas = {};
      if (aiBlocking) out.tacticsCanvas.ai_blocking = deepClone(aiBlocking);
      if (ambiguous) out.tacticsCanvas.ambiguous = deepClone(ambiguous);
    }

    if (isObject(input && input.extensions)) {
      Object.assign(out, deepClone(input.extensions));
    }

    return out;
  }

  function normalizeMapMetadata(input, options) {
    const opts = isObject(options) ? options : {};
    const imageName = opts.imageName || "untitled-map.png";
    const imageWidth = toPositiveInt(opts.imageWidth, 1200);
    const imageHeight = toPositiveInt(opts.imageHeight, 800);

    const src = isObject(input) ? deepClone(input) : {};
    const version = src.schema_version || "0.1.0";

    const mapName =
      (src.map && src.map.name) ||
      (src.map && src.map.image_ref) ||
      imageName;
    const mapImageRef =
      (src.map && src.map.image_ref) ||
      mapName ||
      imageName;
    const mapWidth = toPositiveInt(
      src.map && src.map.image_width_px,
      imageWidth
    );
    const mapHeight = toPositiveInt(
      src.map && src.map.image_height_px,
      imageHeight
    );

    const rows = toPositiveInt(src.grid && src.grid.rows, 1);
    const cols = toPositiveInt(src.grid && src.grid.cols, 1);
    const tileSizePx = toPositiveInt(src.grid && src.grid.tile_size_px, 32);

    const blocking = ensureBlockingGrid(
      src.layers && src.layers.blocking,
      rows,
      cols
    );

    const calibration = {
      mapOffsetPx: {
        x: toNumber(src.calibration && src.calibration.map_offset_px && src.calibration.map_offset_px.x, 0),
        y: toNumber(src.calibration && src.calibration.map_offset_px && src.calibration.map_offset_px.y, 0)
      },
      mapScale: toNumber(src.calibration && src.calibration.map_scale, 1.0),
      mapRotationDeg: toNumber(src.calibration && src.calibration.map_rotation_deg, 0),
      mapOpacity: toNumber(src.calibration && src.calibration.map_opacity, 1.0)
    };

    const annotation = defaultAnnotation();

    if (isObject(src.annotation && src.annotation.ai)) {
      annotation.ai.status = src.annotation.ai.status != null ? src.annotation.ai.status : null;
      annotation.ai.model = src.annotation.ai.model != null ? src.annotation.ai.model : null;
      annotation.ai.scope = src.annotation.ai.scope != null ? src.annotation.ai.scope : null;
      annotation.ai.notes = Array.isArray(src.annotation.ai.notes)
        ? src.annotation.ai.notes.slice()
        : [];
    }

    if (isObject(src.annotation && src.annotation.review)) {
      annotation.review.labelSource =
        src.annotation.review.label_source != null ? src.annotation.review.label_source : null;
      annotation.review.labeler =
        src.annotation.review.labeler != null ? src.annotation.review.labeler : null;
      annotation.review.reviewStatus =
        src.annotation.review.review_status != null ? src.annotation.review.review_status : null;
      annotation.review.reviewer =
        src.annotation.review.reviewer != null ? src.annotation.review.reviewer : null;
      annotation.review.blockingRuleVersion =
        src.annotation.review.blocking_rule_version != null
          ? src.annotation.review.blocking_rule_version
          : null;
      annotation.review.createdAt =
        src.annotation.review.created_at != null ? src.annotation.review.created_at : null;
      annotation.review.updatedAt =
        src.annotation.review.updated_at != null ? src.annotation.review.updated_at : null;
      annotation.review.notes =
        src.annotation.review.notes != null ? src.annotation.review.notes : null;
    }

    if (isObject(src.ai_annotation)) {
      annotation.ai.status =
        src.ai_annotation.status != null ? src.ai_annotation.status : annotation.ai.status;
      annotation.ai.model =
        src.ai_annotation.model != null ? src.ai_annotation.model : annotation.ai.model;
      annotation.ai.scope =
        src.ai_annotation.scope != null ? src.ai_annotation.scope : annotation.ai.scope;
      annotation.ai.notes = Array.isArray(src.ai_annotation.notes)
        ? src.ai_annotation.notes.slice()
        : annotation.ai.notes;
    }

    if (isObject(src.label_source)) {
      annotation.review.labelSource =
        src.label_source.status != null ? src.label_source.status : annotation.review.labelSource;
      annotation.review.labeler =
        src.label_source.labeler != null ? src.label_source.labeler : annotation.review.labeler;
      annotation.review.reviewStatus =
        src.label_source.review_status != null
          ? src.label_source.review_status
          : annotation.review.reviewStatus;
      annotation.review.reviewer =
        src.label_source.reviewer != null ? src.label_source.reviewer : annotation.review.reviewer;
      annotation.review.blockingRuleVersion =
        src.label_source.blocking_rule_version != null
          ? src.label_source.blocking_rule_version
          : annotation.review.blockingRuleVersion;
      annotation.review.createdAt =
        src.label_source.created_at != null
          ? src.label_source.created_at
          : annotation.review.createdAt;
      annotation.review.updatedAt =
        src.label_source.updated_at != null
          ? src.label_source.updated_at
          : annotation.review.updatedAt;
    }

    if (isObject(src.case_metadata) && typeof src.case_metadata.notes === "string") {
      annotation.review.notes = src.case_metadata.notes;
    }

    return {
      schemaVersion: "1.0.0",
      purpose: "tactical_map_metadata",

      map: {
        id: (src.map && src.map.id) || slugFromName(mapName),
        name: mapName,
        imageRef: mapImageRef,
        imageWidthPx: mapWidth,
        imageHeightPx: mapHeight
      },

      grid: {
        type: "square",
        origin: "bottom_left",
        rows: rows,
        cols: cols,
        tileSizePx: tileSizePx
      },

      calibration: {
        mapOffsetPx: {
          x: calibration.mapOffsetPx.x,
          y: calibration.mapOffsetPx.y
        },
        mapScale: calibration.mapScale,
        mapRotationDeg: calibration.mapRotationDeg,
        mapOpacity: calibration.mapOpacity
      },

      layers: {
        blocking: blocking
      },

      annotation: annotation,
      extensions: extractExtensions(src),

      _meta: {
        importedSchemaVersion: version
      }
    };
  }

  function validateNormalizedMapMetadata(metadata) {
    const errors = [];

    if (!isObject(metadata)) {
      return { valid: false, errors: ["metadata must be an object"] };
    }

    if (metadata.schemaVersion !== "1.0.0") {
      errors.push("schemaVersion must be 1.0.0");
    }

    if (metadata.purpose !== "tactical_map_metadata") {
      errors.push('purpose must equal "tactical_map_metadata"');
    }

    if (!metadata.grid || metadata.grid.type !== "square") {
      errors.push('grid.type must equal "square"');
    }

    if (!metadata.grid || metadata.grid.origin !== "bottom_left") {
      errors.push('grid.origin must equal "bottom_left"');
    }

    const rows = metadata.grid && metadata.grid.rows;
    const cols = metadata.grid && metadata.grid.cols;

    if (!Number.isInteger(rows) || rows <= 0) {
      errors.push("grid.rows must be a positive integer");
    }

    if (!Number.isInteger(cols) || cols <= 0) {
      errors.push("grid.cols must be a positive integer");
    }

    if (!(metadata.grid && metadata.grid.tileSizePx > 0)) {
      errors.push("grid.tileSizePx must be > 0");
    }

    if (!(metadata.map && metadata.map.imageWidthPx > 0)) {
      errors.push("map.imageWidthPx must be > 0");
    }

    if (!(metadata.map && metadata.map.imageHeightPx > 0)) {
      errors.push("map.imageHeightPx must be > 0");
    }

    const blocking = metadata.layers && metadata.layers.blocking;
    if (!Array.isArray(blocking) || blocking.length !== rows) {
      errors.push("layers.blocking must have one row per grid row");
    } else {
      for (let r = 0; r < blocking.length; r++) {
        if (!Array.isArray(blocking[r]) || blocking[r].length !== cols) {
          errors.push("layers.blocking row " + r + " must contain exactly " + cols + " columns");
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  function serializeMapMetadata(normalized) {
    const review = (normalized && normalized.annotation && normalized.annotation.review) || {};
    const ai = (normalized && normalized.annotation && normalized.annotation.ai) || {};

    return {
      schema_version: "1.0.0",
      purpose: "tactical_map_metadata",

      map: {
        id: normalized.map.id,
        name: normalized.map.name,
        image_ref: normalized.map.imageRef,
        image_width_px: normalized.map.imageWidthPx,
        image_height_px: normalized.map.imageHeightPx
      },

      grid: {
        type: normalized.grid.type,
        origin: normalized.grid.origin,
        rows: normalized.grid.rows,
        cols: normalized.grid.cols,
        tile_size_px: normalized.grid.tileSizePx
      },

      calibration: {
        map_offset_px: {
          x: normalized.calibration.mapOffsetPx.x,
          y: normalized.calibration.mapOffsetPx.y
        },
        map_scale: normalized.calibration.mapScale,
        map_rotation_deg: normalized.calibration.mapRotationDeg,
        map_opacity: normalized.calibration.mapOpacity
      },

      layers: {
        blocking: deepClone(normalized.layers.blocking)
      },

      annotation: {
        ai: {
          status: ai.status != null ? ai.status : null,
          model: ai.model != null ? ai.model : null,
          scope: ai.scope != null ? ai.scope : null,
          notes: Array.isArray(ai.notes) ? ai.notes.slice() : []
        },
        review: {
          label_source: review.labelSource != null ? review.labelSource : null,
          labeler: review.labeler != null ? review.labeler : null,
          review_status: review.reviewStatus != null ? review.reviewStatus : null,
          reviewer: review.reviewer != null ? review.reviewer : null,
          blocking_rule_version:
            review.blockingRuleVersion != null ? review.blockingRuleVersion : null,
          created_at: review.createdAt != null ? review.createdAt : null,
          updated_at: review.updatedAt != null ? review.updatedAt : null,
          notes: review.notes != null ? review.notes : null
        }
      },

      extensions: isObject(normalized.extensions) ? deepClone(normalized.extensions) : {}
    };
  }

  const api = {
    makeGrid: makeGrid,
    normalizeMapMetadata: normalizeMapMetadata,
    validateNormalizedMapMetadata: validateNormalizedMapMetadata,
    serializeMapMetadata: serializeMapMetadata
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.MapMetadata = api;
})(typeof window !== "undefined" ? window : globalThis);
