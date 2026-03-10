const TILE_TYPES = [
  ["blocking", "Blocking / Impassable"],
  ["difficult", "Difficult Terrain"],
  ["half_cover", "Half Cover"],
  ["three_quarter_cover", "Three-Quarter Cover"],
  ["full_cover", "Full Cover"],
  ["hazard", "Hazard"],
  ["water", "Water"],
  ["elevated", "Elevation Change"],
];

const EDGE_TYPES = [
  ["wall", "Wall"],
  ["door_closed", "Door (Closed)"],
  ["door_open", "Door (Open)"],
  ["window", "Window"],
  ["low_wall", "Low Wall"],
  ["fence", "Fence"],
];

const OBJECT_TYPES = [
  ["pillar", "Pillar"],
  ["crate_stack", "Crate Stack"],
  ["statue", "Statue"],
  ["table", "Table"],
  ["brazier", "Brazier"],
  ["tree", "Tree"],
  ["boulder", "Boulder"],
];

const OVERLAY_STYLES = {
  blocking: { fill: "rgba(220,38,38,0.45)", stroke: "rgba(220,38,38,0.9)", label: "X" },
  difficult: { fill: "rgba(234,179,8,0.35)", stroke: "rgba(234,179,8,0.95)", label: "D" },
  half_cover: { fill: "rgba(59,130,246,0.28)", stroke: "rgba(59,130,246,0.9)", label: "½" },
  three_quarter_cover: { fill: "rgba(37,99,235,0.34)", stroke: "rgba(37,99,235,0.95)", label: "¾" },
  full_cover: { fill: "rgba(30,64,175,0.42)", stroke: "rgba(30,64,175,0.95)", label: "F" },
  hazard: { fill: "rgba(168,85,247,0.32)", stroke: "rgba(168,85,247,0.95)", label: "!" },
  water: { fill: "rgba(6,182,212,0.28)", stroke: "rgba(6,182,212,0.95)", label: "W" },
  elevated: { fill: "rgba(34,197,94,0.28)", stroke: "rgba(34,197,94,0.95)", label: "↑" },
};

const EDGE_STYLES = {
  wall: { stroke: "rgba(239,68,68,0.98)", width: 5, dash: [], label: "W" },
  door_closed: { stroke: "rgba(245,158,11,0.98)", width: 5, dash: [10, 6], label: "D" },
  door_open: { stroke: "rgba(34,197,94,0.98)", width: 4, dash: [6, 6], label: "O" },
  window: { stroke: "rgba(56,189,248,0.98)", width: 4, dash: [3, 5], label: "Win" },
  low_wall: { stroke: "rgba(59,130,246,0.98)", width: 4, dash: [], label: "LW" },
  fence: { stroke: "rgba(148,163,184,0.98)", width: 3, dash: [2, 4], label: "F" },
};

const OBJECT_STYLES = {
  pillar: { fill: "rgba(244,244,245,0.9)", stroke: "rgba(24,24,27,0.95)", label: "P", cover: "full", passable: false, vision_blocking: true },
  crate_stack: { fill: "rgba(180,83,9,0.9)", stroke: "rgba(120,53,15,0.95)", label: "C", cover: "half", passable: false, vision_blocking: false },
  statue: { fill: "rgba(161,161,170,0.9)", stroke: "rgba(39,39,42,0.95)", label: "S", cover: "full", passable: false, vision_blocking: true },
  table: { fill: "rgba(120,53,15,0.9)", stroke: "rgba(68,35,15,0.95)", label: "T", cover: "half", passable: false, vision_blocking: false },
  brazier: { fill: "rgba(249,115,22,0.9)", stroke: "rgba(124,45,18,0.95)", label: "B", cover: "none", passable: false, vision_blocking: false },
  tree: { fill: "rgba(34,197,94,0.9)", stroke: "rgba(21,128,61,0.95)", label: "Tr", cover: "three_quarter", passable: false, vision_blocking: true },
  boulder: { fill: "rgba(113,113,122,0.9)", stroke: "rgba(39,39,42,0.95)", label: "R", cover: "full", passable: false, vision_blocking: true },
};

const state = {
  imageName: "untitled-map.png",
  imageUrl: null,
  imageSize: { width: 960, height: 640 },
  tileSize: 70,
  originX: 0,
  originY: 0,
  tool: "paint",
  tileBrush: "blocking",
  edgeBrush: "wall",
  objectBrush: "pillar",
  showGrid: true,
  showTiles: true,
  showEdges: true,
  showObjects: true,
  showLabels: true,
  isPainting: false,
  metadata: null,
};

const els = {
  canvas: document.getElementById("mapCanvas"),
  hiddenImage: document.getElementById("hiddenMapImage"),
  mapFileInput: document.getElementById("mapFileInput"),
  mapName: document.getElementById("mapName"),
  mapSize: document.getElementById("mapSize"),
  tileSizeInput: document.getElementById("tileSizeInput"),
  originXInput: document.getElementById("originXInput"),
  originYInput: document.getElementById("originYInput"),
  gridDims: document.getElementById("gridDims"),
  resetBtn: document.getElementById("resetBtn"),
  toolSelect: document.getElementById("toolSelect"),
  tileBrushSelect: document.getElementById("tileBrushSelect"),
  edgeBrushSelect: document.getElementById("edgeBrushSelect"),
  objectBrushSelect: document.getElementById("objectBrushSelect"),
  showGridInput: document.getElementById("showGridInput"),
  showTilesInput: document.getElementById("showTilesInput"),
  showEdgesInput: document.getElementById("showEdgesInput"),
  showObjectsInput: document.getElementById("showObjectsInput"),
  showLabelsInput: document.getElementById("showLabelsInput"),
  validateBtn: document.getElementById("validateBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  serverExportBtn: document.getElementById("serverExportBtn"),
  validationBox: document.getElementById("validationBox"),
  objectList: document.getElementById("objectList"),
  metadataPreview: document.getElementById("metadataPreview"),
};

function edgeKey(a, b) {
  const ak = `${a.r},${a.c}`;
  const bk = `${b.r},${b.c}`;
  return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
}

function objectKey(cell) {
  return `${cell.r},${cell.c}`;
}

function getCols() {
  return Math.max(1, Math.floor((state.imageSize.width - state.originX) / state.tileSize));
}

function getRows() {
  return Math.max(1, Math.floor((state.imageSize.height - state.originY) / state.tileSize));
}

function createEmptyGrid(cols, rows, fill = "open") {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}

function buildDefaultMetadata() {
  const cols = getCols();
  const rows = getRows();
  return {
    schema_version: "0.1.0",
    map: {
      id: state.imageName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_"),
      name: state.imageName,
      image_ref: state.imageName,
      image_width_px: state.imageSize.width,
      image_height_px: state.imageSize.height,
    },
    grid: {
      type: "square",
      units_per_tile: 5,
      units_label: "ft",
      tile_size_px: state.tileSize,
      origin_px: { x: state.originX, y: state.originY },
      dimensions_tiles: { cols, rows },
    },
    defaults: {
      passable: true,
      movement_cost: 1,
      vision_blocking: false,
      cover: "none",
      terrain: "open",
    },
    layers: {
      terrain: createEmptyGrid(cols, rows, "open"),
    },
    edges: [],
    objects: [],
    legend: {},
    ai_annotation: {
      status: "none",
      model: null,
      confidence_summary: null,
      notes: [],
    },
  };
}

function resizeMetadataPreservingContent() {
  const next = buildDefaultMetadata();
  const prev = state.metadata || buildDefaultMetadata();
  const rows = getRows();
  const cols = getCols();

  const prevTerrain = prev.layers?.terrain || [];
  for (let r = 0; r < Math.min(rows, prevTerrain.length); r++) {
    for (let c = 0; c < Math.min(cols, prevTerrain[r].length); c++) {
      next.layers.terrain[r][c] = prevTerrain[r][c];
    }
  }

  next.edges = (prev.edges || []).filter((e) => {
    return e.a.r < rows && e.a.c < cols && e.b.r < rows && e.b.c < cols;
  });

  next.objects = (prev.objects || []).filter((o) => {
    return o.anchor.r < rows && o.anchor.c < cols;
  });

  state.metadata = next;
}

function edgeTypeToFeature(edgeType, a, b) {
  const base = { a, b, movement_cost: null, tags: [] };
  switch (edgeType) {
    case "wall":
      return { ...base, type: "wall", passable: false, vision_blocking: true, cover: "full" };
    case "door_closed":
      return { ...base, type: "door", state: "closed", passable: false, vision_blocking: true, cover: "full" };
    case "door_open":
      return { ...base, type: "door", state: "open", passable: true, vision_blocking: false, cover: "none" };
    case "window":
      return { ...base, type: "window", passable: false, vision_blocking: false, cover: "half" };
    case "low_wall":
      return { ...base, type: "low_wall", passable: false, vision_blocking: false, cover: "three_quarter" };
    case "fence":
      return { ...base, type: "fence", passable: false, vision_blocking: false, cover: "half" };
    default:
      return { ...base, type: "wall", passable: false, vision_blocking: true, cover: "full" };
  }
}

function featureToEdgeStyleKey(feature) {
  if (feature.type === "door" && feature.state === "closed") return "door_closed";
  if (feature.type === "door" && feature.state === "open") return "door_open";
  if (feature.type === "window") return "window";
  if (feature.type === "low_wall") return "low_wall";
  if (feature.type === "fence") return "fence";
  return "wall";
}

function objectTypeToFeature(type, cell, idx) {
  const style = OBJECT_STYLES[type] || OBJECT_STYLES.pillar;
  return {
    id: `${type}_${idx}`,
    type,
    anchor: cell,
    footprint: [cell],
    passable: style.passable,
    vision_blocking: style.vision_blocking,
    cover: style.cover,
    movement_cost: null,
    tags: [],
  };
}

function populateSelect(select, values) {
  select.innerHTML = "";
  for (const [value, label] of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
}

function syncUi() {
  els.mapName.textContent = state.imageName;
  els.mapSize.textContent = `${state.imageSize.width} × ${state.imageSize.height}`;
  els.gridDims.textContent = `${getCols()} × ${getRows()}`;
  els.tileSizeInput.value = state.tileSize;
  els.originXInput.value = state.originX;
  els.originYInput.value = state.originY;
  els.toolSelect.value = state.tool;
  els.tileBrushSelect.value = state.tileBrush;
  els.edgeBrushSelect.value = state.edgeBrush;
  els.objectBrushSelect.value = state.objectBrush;
  els.showGridInput.checked = state.showGrid;
  els.showTilesInput.checked = state.showTiles;
  els.showEdgesInput.checked = state.showEdges;
  els.showObjectsInput.checked = state.showObjects;
  els.showLabelsInput.checked = state.showLabels;
  els.metadataPreview.textContent = JSON.stringify(state.metadata, null, 2);

  const objects = state.metadata.objects || [];
  els.objectList.innerHTML = "";
  if (objects.length === 0) {
    els.objectList.textContent = "No tactical objects placed yet.";
  } else {
    for (const obj of objects) {
      const div = document.createElement("div");
      div.className = "object-card";
      div.innerHTML = `<strong>${obj.id}</strong><br><span>${obj.type} at (${obj.anchor.r}, ${obj.anchor.c})</span>`;
      els.objectList.appendChild(div);
    }
  }
}

function draw() {
  const ctx = els.canvas.getContext("2d");
  els.canvas.width = state.imageSize.width;
  els.canvas.height = state.imageSize.height;
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);

  if (els.hiddenImage.src) {
    ctx.drawImage(els.hiddenImage, 0, 0, state.imageSize.width, state.imageSize.height);
  } else {
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "600 24px sans-serif";
    ctx.fillText("Upload a battle map to begin", 24, 40);
  }

  const cols = getCols();
  const rows = getRows();

  if (state.showTiles) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = state.metadata.layers.terrain[r]?.[c] || "open";
        if (cell === "open") continue;
        const style = OVERLAY_STYLES[cell];
        if (!style) continue;
        const x = state.originX + c * state.tileSize;
        const y = state.originY + r * state.tileSize;
        ctx.fillStyle = style.fill;
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, state.tileSize, state.tileSize);
        ctx.strokeRect(x, y, state.tileSize, state.tileSize);
        if (state.showLabels) {
          ctx.fillStyle = "rgba(255,255,255,0.95)";
          ctx.font = `600 ${Math.max(12, Math.floor(state.tileSize * 0.24))}px sans-serif`;
          ctx.fillText(style.label, x + state.tileSize * 0.38, y + state.tileSize * 0.6);
        }
      }
    }
  }

  if (state.showEdges) {
    for (const edge of state.metadata.edges || []) {
      const styleKey = featureToEdgeStyleKey(edge);
      const style = EDGE_STYLES[styleKey];
      if (!style) continue;

      const isHorizontalNeighbor = edge.a.r === edge.b.r && Math.abs(edge.a.c - edge.b.c) === 1;
      const isVerticalNeighbor = edge.a.c === edge.b.c && Math.abs(edge.a.r - edge.b.r) === 1;
      if (!isHorizontalNeighbor && !isVerticalNeighbor) continue;

      let x1, y1, x2, y2;

      if (isHorizontalNeighbor) {
        const leftC = Math.min(edge.a.c, edge.b.c);
        x1 = state.originX + (leftC + 1) * state.tileSize;
        x2 = x1;
        y1 = state.originY + edge.a.r * state.tileSize;
        y2 = y1 + state.tileSize;
      } else {
        const topR = Math.min(edge.a.r, edge.b.r);
        y1 = state.originY + (topR + 1) * state.tileSize;
        y2 = y1;
        x1 = state.originX + edge.a.c * state.tileSize;
        x2 = x1 + state.tileSize;
      }

      ctx.save();
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = style.width;
      ctx.setLineDash(style.dash);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    }
  }

  if (state.showObjects) {
    for (const obj of state.metadata.objects || []) {
      const style = OBJECT_STYLES[obj.type] || OBJECT_STYLES.pillar;
      const x = state.originX + obj.anchor.c * state.tileSize;
      const y = state.originY + obj.anchor.r * state.tileSize;
      const inset = Math.max(6, state.tileSize * 0.18);
      ctx.fillStyle = style.fill;
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x + inset, y + inset, state.tileSize - inset * 2, state.tileSize - inset * 2, 10);
      ctx.fill();
      ctx.stroke();
      if (state.showLabels) {
        ctx.fillStyle = "rgba(255,255,255,0.98)";
        ctx.font = `700 ${Math.max(10, Math.floor(state.tileSize * 0.16))}px sans-serif`;
        ctx.fillText(style.label, x + state.tileSize * 0.34, y + state.tileSize * 0.55);
      }
    }
  }

  if (state.showGrid) {
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    for (let c = 0; c <= cols; c++) {
      const x = state.originX + c * state.tileSize;
      ctx.beginPath();
      ctx.moveTo(x, state.originY);
      ctx.lineTo(x, state.originY + rows * state.tileSize);
      ctx.stroke();
    }
    for (let r = 0; r <= rows; r++) {
      const y = state.originY + r * state.tileSize;
      ctx.beginPath();
      ctx.moveTo(state.originX, y);
      ctx.lineTo(state.originX + cols * state.tileSize, y);
      ctx.stroke();
    }
  }
}

function screenToCanvas(clientX, clientY) {
  const rect = els.canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (els.canvas.width / rect.width),
    y: (clientY - rect.top) * (els.canvas.height / rect.height),
  };
}

function applyPointer(clientX, clientY) {
  const { x, y } = screenToCanvas(clientX, clientY);
  const c = Math.floor((x - state.originX) / state.tileSize);
  const r = Math.floor((y - state.originY) / state.tileSize);
  const cols = getCols();
  const rows = getRows();

  if (r < 0 || c < 0 || r >= rows || c >= cols) return;
  const cell = { r, c };

  if (state.tool === "paint" || state.tool === "erase") {
    state.metadata.layers.terrain[r][c] = state.tool === "erase" ? "open" : state.tileBrush;
    syncUi();
    draw();
    return;
  }

  if (state.tool === "object" || state.tool === "object_erase") {
    const key = objectKey(cell);
    const filtered = (state.metadata.objects || []).filter((o) => objectKey(o.anchor) !== key);
    state.metadata.objects = state.tool === "object_erase"
      ? filtered
      : [...filtered, objectTypeToFeature(state.objectBrush, cell, filtered.length + 1)];
    syncUi();
    draw();
    return;
  }

  if (state.tool === "edge" || state.tool === "edge_erase") {
    const localX = x - state.originX;
    const localY = y - state.originY;
    const offsetX = localX - c * state.tileSize;
    const offsetY = localY - r * state.tileSize;
    const nearest = [
      { side: "top", d: offsetY },
      { side: "bottom", d: Math.abs(state.tileSize - offsetY) },
      { side: "left", d: offsetX },
      { side: "right", d: Math.abs(state.tileSize - offsetX) },
    ].sort((a, b) => a.d - b.d)[0].side;

    let a = null;
    let b = null;

    if (nearest === "left" && c > 0) {
      a = { r, c: c - 1 };
      b = { r, c };
    } else if (nearest === "right" && c < cols - 1) {
      a = { r, c };
      b = { r, c: c + 1 };
    } else if (nearest === "top" && r > 0) {
      a = { r: r - 1, c };
      b = { r, c };
    } else if (nearest === "bottom" && r < rows - 1) {
      a = { r, c };
      b = { r: r + 1, c };
    }

    if (!a || !b) return;

    const key = edgeKey(a, b);
    const filtered = (state.metadata.edges || []).filter((e) => edgeKey(e.a, e.b) !== key);
    state.metadata.edges = state.tool === "edge_erase"
      ? filtered
      : [...filtered, edgeTypeToFeature(state.edgeBrush, a, b)];
    syncUi();
    draw();
  }
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(state.metadata, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${state.metadata.map.id}.tactical-map.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function validateOnServer() {
  const res = await fetch("/api/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.metadata),
  });
  const data = await res.json();

  if (data.valid) {
    els.validationBox.className = "status-box status-ok";
    els.validationBox.textContent = "Metadata is valid.";
  } else {
    els.validationBox.className = "status-box status-error";
    els.validationBox.textContent = data.errors.join("\n");
  }
}

async function exportViaServer() {
  const res = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.metadata),
  });
  const data = await res.json();

  if (!res.ok) {
    els.validationBox.className = "status-box status-error";
    els.validationBox.textContent = (data.errors || ["Export failed"]).join("\n");
    return;
  }

  els.validationBox.className = "status-box status-ok";
  els.validationBox.textContent = `Saved to server as ${data.fileName}`;
}

function wireEvents() {
  els.mapFileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    state.imageName = file.name;
    const url = URL.createObjectURL(file);
    state.imageUrl = url;
    els.hiddenImage.onload = () => {
      state.imageSize = { width: els.hiddenImage.naturalWidth, height: els.hiddenImage.naturalHeight };
      resizeMetadataPreservingContent();
      syncUi();
      draw();
    };
    els.hiddenImage.src = url;
  });

  els.tileSizeInput.addEventListener("input", () => {
    state.tileSize = Math.max(1, Number(els.tileSizeInput.value || 1));
    resizeMetadataPreservingContent();
    syncUi();
    draw();
  });

  els.originXInput.addEventListener("input", () => {
    state.originX = Number(els.originXInput.value || 0);
    resizeMetadataPreservingContent();
    syncUi();
    draw();
  });

  els.originYInput.addEventListener("input", () => {
    state.originY = Number(els.originYInput.value || 0);
    resizeMetadataPreservingContent();
    syncUi();
    draw();
  });

  els.toolSelect.addEventListener("change", () => { state.tool = els.toolSelect.value; });
  els.tileBrushSelect.addEventListener("change", () => { state.tileBrush = els.tileBrushSelect.value; });
  els.edgeBrushSelect.addEventListener("change", () => { state.edgeBrush = els.edgeBrushSelect.value; });
  els.objectBrushSelect.addEventListener("change", () => { state.objectBrush = els.objectBrushSelect.value; });
  els.showGridInput.addEventListener("change", () => { state.showGrid = els.showGridInput.checked; draw(); });
  els.showTilesInput.addEventListener("change", () => { state.showTiles = els.showTilesInput.checked; draw(); });
  els.showEdgesInput.addEventListener("change", () => { state.showEdges = els.showEdgesInput.checked; draw(); });
  els.showObjectsInput.addEventListener("change", () => { state.showObjects = els.showObjectsInput.checked; draw(); });
  els.showLabelsInput.addEventListener("change", () => { state.showLabels = els.showLabelsInput.checked; draw(); });
  els.resetBtn.addEventListener("click", () => { state.metadata = buildDefaultMetadata(); syncUi(); draw(); });
  els.downloadBtn.addEventListener("click", downloadJson);
  els.validateBtn.addEventListener("click", validateOnServer);
  els.serverExportBtn.addEventListener("click", exportViaServer);

  els.canvas.addEventListener("mousedown", (e) => {
    state.isPainting = true;
    applyPointer(e.clientX, e.clientY);
  });
  els.canvas.addEventListener("mousemove", (e) => {
    if (state.isPainting) applyPointer(e.clientX, e.clientY);
  });
  window.addEventListener("mouseup", () => {
    state.isPainting = false;
  });
}

function init() {
  populateSelect(els.tileBrushSelect, TILE_TYPES);
  populateSelect(els.edgeBrushSelect, EDGE_TYPES);
  populateSelect(els.objectBrushSelect, OBJECT_TYPES);
  state.metadata = buildDefaultMetadata();
  wireEvents();
  syncUi();
  draw();
}

init();