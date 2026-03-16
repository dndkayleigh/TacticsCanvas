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

function makeGrid(rows, cols, fill = false) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => fill)
  );
}

function makeEdgeLayer(rows, cols, semantic = "core.blocking") {
  return {
    semantic,
    topology: "edge_matrix",
    value_type: "boolean",
    default: false,
    horizontal: makeGrid(rows + 1, cols, false),
    vertical: makeGrid(rows, cols + 1, false),
  };
}

function normalizeEdgeLayer(layer, rows, cols, semantic = "core.blocking") {
  const normalized = makeEdgeLayer(rows, cols, semantic);
  const source = layer && typeof layer === "object" ? layer : {};

  normalized.semantic = source.semantic || semantic;
  normalized.topology = source.topology || "edge_matrix";
  normalized.value_type = source.value_type || "boolean";
  normalized.default = source.default === undefined ? false : Boolean(source.default);

  for (let y = 0; y < rows + 1; y++) {
    for (let x = 0; x < cols; x++) {
      normalized.horizontal[y][x] = Boolean(source.horizontal?.[y]?.[x]);
    }
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols + 1; x++) {
      normalized.vertical[y][x] = Boolean(source.vertical?.[y]?.[x]);
    }
  }

  return normalized;
}

function migrateTileBlockingToEdgeLayer(blocking, rows, cols) {
  const layer = makeEdgeLayer(rows, cols, "core.blocking");

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!Boolean(blocking?.[r]?.[c])) continue;

      const southBlocked = r === 0 || !Boolean(blocking?.[r - 1]?.[c]);
      const northBlocked = r === rows - 1 || !Boolean(blocking?.[r + 1]?.[c]);
      const westBlocked = c === 0 || !Boolean(blocking?.[r]?.[c - 1]);
      const eastBlocked = c === cols - 1 || !Boolean(blocking?.[r]?.[c + 1]);

      if (southBlocked) layer.horizontal[r][c] = true;
      if (northBlocked) layer.horizontal[r + 1][c] = true;
      if (westBlocked) layer.vertical[r][c] = true;
      if (eastBlocked) layer.vertical[r][c + 1] = true;
    }
  }

  return layer;
}

function deriveTileBlockingFromEdgeLayer(layer, rows, cols) {
  const normalized = normalizeEdgeLayer(layer, rows, cols, "core.blocking");
  const reachable = makeGrid(rows, cols, false);
  const queue = [];

  function enqueue(r, c) {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    if (reachable[r][c]) return;
    reachable[r][c] = true;
    queue.push([r, c]);
  }

  for (let c = 0; c < cols; c++) {
    if (!normalized.horizontal[0][c]) enqueue(0, c);
    if (!normalized.horizontal[rows][c]) enqueue(rows - 1, c);
  }

  for (let r = 0; r < rows; r++) {
    if (!normalized.vertical[r][0]) enqueue(r, 0);
    if (!normalized.vertical[r][cols]) enqueue(r, cols - 1);
  }

  while (queue.length) {
    const [r, c] = queue.shift();

    if (r > 0 && !normalized.horizontal[r][c]) enqueue(r - 1, c);
    if (r < rows - 1 && !normalized.horizontal[r + 1][c]) enqueue(r + 1, c);
    if (c > 0 && !normalized.vertical[r][c]) enqueue(r, c - 1);
    if (c < cols - 1 && !normalized.vertical[r][c + 1]) enqueue(r, c + 1);
  }

  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => !reachable[r][c])
  );
}

function inferGridFromLayers(layers) {
  const candidates = [
    layers?.blocking,
    layers?.ai_blocking,
    layers?.ambiguous,
  ].filter(Array.isArray);

  let rows = 0;
  let cols = 0;

  for (const grid of candidates) {
    rows = Math.max(rows, grid.length);
    for (const row of grid) {
      if (Array.isArray(row)) {
        cols = Math.max(cols, row.length);
      }
    }
  }

  if (rows > 0 && cols > 0) {
    return { rows, cols };
  }

  return null;
}

function inferGridFromEdgeLayer(layer) {
  if (!layer || typeof layer !== "object") {
    return null;
  }

  const horizontalRows = Array.isArray(layer.horizontal) ? layer.horizontal.length : 0;
  const verticalRows = Array.isArray(layer.vertical) ? layer.vertical.length : 0;
  const horizontalCols = Array.isArray(layer.horizontal?.[0]) ? layer.horizontal[0].length : 0;
  const verticalCols = Array.isArray(layer.vertical?.[0]) ? layer.vertical[0].length : 0;

  const rows = verticalRows || Math.max(0, horizontalRows - 1);
  const cols = horizontalCols || Math.max(0, verticalCols - 1);

  if (rows > 0 && cols > 0) {
    return { rows, cols };
  }

  return null;
}

function nowIso() {
  return new Date().toISOString();
}

function ensureMetadataShape(metadata, imageName, width, height) {
  if (!metadata || typeof metadata !== "object") {
    metadata = {};
  }

  const defaultGrid = computeDefaultGridForImage(width, height);
  const inferredEdgeGrid = inferGridFromEdgeLayer(
    metadata?.tactical?.boundary_layers?.blocking
  );
  const inferredGrid = inferGridFromLayers(metadata.layers);
  const bounded = enforceAspectBoundedGrid(
    metadata?.grid?.rows || inferredGrid?.rows || inferredEdgeGrid?.rows || defaultGrid.rows,
    metadata?.grid?.cols || inferredGrid?.cols || inferredEdgeGrid?.cols || defaultGrid.cols,
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
  const normalizedBlocking = Array.from({ length: bounded.rows }, (_, r) =>
    Array.from({ length: bounded.cols }, (_, c) => Boolean(oldBlocking[r]?.[c]))
  );

  metadata.layers.ai_blocking = Array.from({ length: bounded.rows }, (_, r) =>
    Array.from({ length: bounded.cols }, (_, c) => Boolean(oldAiBlocking[r]?.[c]))
  );

  metadata.layers.ambiguous = Array.from({ length: bounded.rows }, (_, r) =>
    Array.from({ length: bounded.cols }, (_, c) => Boolean(oldAmbiguous[r]?.[c]))
  );

  metadata.tactical ||= {};
  metadata.tactical.boundary_layers ||= {};
  metadata.tactical.cell_layers ||= {};
  metadata.tactical.boundary_layers.blocking = normalizeEdgeLayer(
    metadata?.tactical?.boundary_layers?.blocking ||
      migrateTileBlockingToEdgeLayer(normalizedBlocking, bounded.rows, bounded.cols),
    bounded.rows,
    bounded.cols,
    "core.blocking"
  );
  metadata.layers.blocking = deriveTileBlockingFromEdgeLayer(
    metadata.tactical.boundary_layers.blocking,
    bounded.rows,
    bounded.cols
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
  makeEdgeLayer,
  normalizeEdgeLayer,
  migrateTileBlockingToEdgeLayer,
  deriveTileBlockingFromEdgeLayer,
  inferGridFromLayers,
  inferGridFromEdgeLayer,
  nowIso,
  ensureMetadataShape,
};
