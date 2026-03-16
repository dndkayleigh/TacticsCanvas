function computeDefaultGridForImage(width, height) {
  if (width >= height) {
    const cols = 40;
    const rows = Math.max(1, Math.min(40, Math.round((height / width) * cols)));
    return { rows, cols };
  }

  const rows = 40;
  const cols = Math.max(1, Math.min(40, Math.round((width / height) * rows)));
  return { rows, cols };
}

function enforceAspectBoundedGrid(rows, cols, width, height) {
  rows = Math.max(1, Number(rows) || 1);
  cols = Math.max(1, Number(cols) || 1);

  if (width >= height) {
    cols = Math.min(40, Math.max(1, cols));
    rows = Math.max(1, Math.min(40, Math.round((height / width) * cols)));
  } else {
    rows = Math.min(40, Math.max(1, rows));
    cols = Math.max(1, Math.min(40, Math.round((width / height) * rows)));
  }

  return { rows, cols };
}

function computeTileSizeFromGrid(width, height, rows, cols) {
  const sizeFromCols = width / cols;
  const sizeFromRows = height / rows;
  return Math.max(1, Math.round((sizeFromCols + sizeFromRows) / 2));
}

function nowIso() {
  return new Date().toISOString();
}

function ensureMetadataShape(metadata, imageName, width, height) {
  if (!metadata || typeof metadata !== "object") {
    metadata = {};
  }

  const defaultGrid = computeDefaultGridForImage(width, height);
  const bounded = enforceAspectBoundedGrid(
    metadata?.grid?.rows || defaultGrid.rows,
    metadata?.grid?.cols || defaultGrid.cols,
    width,
    height
  );

  const tileSize = computeTileSizeFromGrid(width, height, bounded.rows, bounded.cols);

  metadata.schema_version = metadata.schema_version || "0.1.0";
  metadata.purpose = "tactical_map_metadata";

  metadata.map = {
    name: imageName,
    image_ref: imageName,
    image_width_px: width,
    image_height_px: height,
  };

  metadata.grid = {
    type: "square",
    origin: "bottom_left",
    tile_size_px: tileSize,
    rows: bounded.rows,
    cols: bounded.cols,
  };

  metadata.layers ||= {};
  const oldBlocking = metadata.layers.blocking || [];
  const oldAiBlocking = metadata.layers.ai_blocking || [];
  const oldAmbiguous = metadata.layers.ambiguous || [];

  metadata.layers.blocking = Array.from({ length: bounded.rows }, (_, r) =>
    Array.from({ length: bounded.cols }, (_, c) => Boolean(oldBlocking[r]?.[c]))
  );

  metadata.layers.ai_blocking = Array.from({ length: bounded.rows }, (_, r) =>
    Array.from({ length: bounded.cols }, (_, c) => Boolean(oldAiBlocking[r]?.[c]))
  );

  metadata.layers.ambiguous = Array.from({ length: bounded.rows }, (_, r) =>
    Array.from({ length: bounded.cols }, (_, c) => Boolean(oldAmbiguous[r]?.[c]))
  );

  metadata.ai_annotation ||= {
    status: "none",
    model: null,
    scope: "blocking_only",
    notes: [],
  };

  metadata.label_source ||= {};
  metadata.label_source.status ||= "human_gold";
  metadata.label_source.labeler ||= "";
  metadata.label_source.review_status ||= "in_progress";
  metadata.label_source.reviewer ??= null;
  metadata.label_source.blocking_rule_version ||= "v1";
  metadata.label_source.created_at ||= nowIso();
  metadata.label_source.updated_at ||= nowIso();

  metadata.case_metadata ||= {};
  metadata.case_metadata.notes ||= "";

  return metadata;
}

module.exports = {
  computeDefaultGridForImage,
  enforceAspectBoundedGrid,
  computeTileSizeFromGrid,
  nowIso,
  ensureMetadataShape,
};
