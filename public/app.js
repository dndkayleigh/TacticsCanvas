const imageInput = document.getElementById("imageInput");
const tileSizeInput = document.getElementById("tileSizeInput");
const rowsInput = document.getElementById("rowsInput");
const colsInput = document.getElementById("colsInput");
const draftAiBtn = document.getElementById("draftAiBtn");
const modelSelect = document.getElementById("modelSelect");
const saveBtn = document.getElementById("saveBtn");
const exportBtn = document.getElementById("exportBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const fitViewBtn = document.getElementById("fitViewBtn");
const modePaintBtn = document.getElementById("modePaintBtn");
const modeEraseBtn = document.getElementById("modeEraseBtn");
const modePanBtn = document.getElementById("modePanBtn");
const statusEl = document.getElementById("status");
const draftMetricsEl = document.getElementById("draftMetrics");
const cursorInfoEl = document.getElementById("cursorInfo");
const promptView = document.getElementById("promptView");
const metadataView = document.getElementById("metadataView");
const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");
const hiddenImage = document.getElementById("hiddenImage");

const state = {
  imageName: "untitled-map.png",
  imageWidth: 1200,
  imageHeight: 800,
  imageLoaded: false,
  imageUrl: null,
  tileSize: 30,
  rows: 27,
  cols: 40,
  selectedModel: "gpt-4-mini",
  metadata: null,
  viewScale: 1,
  viewX: 20,
  viewY: 20,
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  dragViewX: 0,
  dragViewY: 0,
  lastDraftLog: null,
  lastDraftPrompt: "",
  toolMode: "paint", // paint | erase | pan
  spacePan: false,
  paintDragging: false,
  hoverTile: null,
  historyUndo: [],
  historyRedo: [],
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function makeBlockingGrid(rows, cols, fill = false) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}

function deepCopyGrid(grid) {
  return grid.map((row) => [...row]);
}

function computeDefaultGridForImage(imageWidth, imageHeight) {
  if (imageWidth >= imageHeight) {
    const cols = 40;
    const rows = Math.max(1, Math.min(40, Math.round((imageHeight / imageWidth) * cols)));
    return { rows, cols };
  } else {
    const rows = 40;
    const cols = Math.max(1, Math.min(40, Math.round((imageWidth / imageHeight) * rows)));
    return { rows, cols };
  }
}

function enforceAspectBoundedGrid(rows, cols, imageWidth, imageHeight) {
  rows = Math.max(1, Number(rows) || 1);
  cols = Math.max(1, Number(cols) || 1);

  if (imageWidth >= imageHeight) {
    cols = clamp(cols, 1, 40);
    rows = Math.max(1, Math.min(40, Math.round((imageHeight / imageWidth) * cols)));
  } else {
    rows = clamp(rows, 1, 40);
    cols = Math.max(1, Math.min(40, Math.round((imageWidth / imageHeight) * rows)));
  }

  return { rows, cols };
}

function computeTileSizeFromGrid(imageWidth, imageHeight, rows, cols) {
  const sizeFromCols = imageWidth / cols;
  const sizeFromRows = imageHeight / rows;
  return Math.max(1, Math.round((sizeFromCols + sizeFromRows) / 2));
}

function buildBlankMetadata() {
  const fitted = computeDefaultGridForImage(state.imageWidth, state.imageHeight);
  const tileSize = computeTileSizeFromGrid(
    state.imageWidth,
    state.imageHeight,
    fitted.rows,
    fitted.cols
  );

  state.rows = fitted.rows;
  state.cols = fitted.cols;
  state.tileSize = tileSize;

  return {
    schema_version: "0.1.0",
    purpose: "tactical_map_metadata",
    map: {
      name: state.imageName,
      image_ref: state.imageName,
      image_width_px: state.imageWidth,
      image_height_px: state.imageHeight,
    },
    grid: {
      type: "square",
      origin: "bottom_left",
      tile_size_px: state.tileSize,
      rows: state.rows,
      cols: state.cols,
    },
    layers: {
      blocking: makeBlockingGrid(state.rows, state.cols, false),
    },
    ai_annotation: {
      status: "none",
      model: state.selectedModel,
      scope: "blocking_only",
      notes: [],
    },
  };
}

function resizeBlockingGrid(prevGrid, rows, cols) {
  const next = makeBlockingGrid(rows, cols, false);
  for (let r = 0; r < Math.min(rows, prevGrid.length); r++) {
    for (let c = 0; c < Math.min(cols, prevGrid[r]?.length || 0); c++) {
      next[r][c] = prevGrid[r][c];
    }
  }
  return next;
}

function buildClientPromptPreview() {
  if (!state.metadata) return "";

  const payload = {
    task: "draft_blocking_tiles_only",
    image_ref: state.metadata.map.image_ref,
    image_width_px: state.metadata.map.image_width_px,
    image_height_px: state.metadata.map.image_height_px,
    grid: state.metadata.grid,
    coordinate_system:
      "Rows are indexed from the bottom of the image upward. Cols are indexed from the left of the image to the right.",
    instructions: [
      "Return a blocking matrix sized exactly rows x cols.",
      "true means the tile is blocked by a wall or other impassable barrier.",
      "false means the tile is not blocked.",
      "Be conservative. Prefer false unless there is clear visual evidence of a wall/barrier.",
    ],
  };

  const systemPrompt =
    "You are drafting tactical RPG map metadata. Return only a blocking tile grid for walls and solid barriers. Do not mark cover, difficult terrain, hazards, elevation, furniture, or decorative art unless the tile is clearly impassable. Use the provided bottom-left grid convention.";

  return [
    `MODEL: ${state.selectedModel}`,
    "",
    "SYSTEM:",
    systemPrompt,
    "",
    "USER:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function renderPromptView() {
  promptView.value = state.lastDraftPrompt || buildClientPromptPreview();
}

function renderDraftMetrics() {
  if (!state.lastDraftLog) {
    draftMetricsEl.textContent = "No AI draft run yet.";
    return;
  }

  draftMetricsEl.textContent = [
    `Model: ${state.lastDraftLog.model_used || state.lastDraftLog.model || "n/a"}`,
    `Turnaround: ${state.lastDraftLog.turnaround_ms} ms`,
    `Input tokens: ${state.lastDraftLog.input_tokens ?? "n/a"}`,
    `Output tokens: ${state.lastDraftLog.output_tokens ?? "n/a"}`,
    `Total tokens: ${state.lastDraftLog.total_tokens ?? "n/a"}`,
    `Blocking tiles after draft: ${state.lastDraftLog.blocking_tiles_after_draft ?? "n/a"}`,
    `Usage source: ${state.lastDraftLog.usage_source ?? "n/a"}`,
  ].join("\n");
}

function renderModeButtons() {
  modePaintBtn.classList.toggle("active", state.toolMode === "paint");
  modeEraseBtn.classList.toggle("active", state.toolMode === "erase");
  modePanBtn.classList.toggle("active", state.toolMode === "pan");

  if (state.toolMode === "pan" || state.spacePan) {
    canvas.classList.add("pan-mode");
  } else {
    canvas.classList.remove("pan-mode");
  }
}

function renderCursorInfo() {
  if (!state.hoverTile) {
    cursorInfoEl.textContent = "No tile selected.";
    return;
  }

  const { r, c } = state.hoverTile;
  const blocking = state.metadata?.layers?.blocking?.[r]?.[c] ? "true" : "false";
  cursorInfoEl.textContent = [
    `Row: ${r}`,
    `Col: ${c}`,
    `Blocking: ${blocking}`,
    `Mode: ${state.toolMode}`,
  ].join("\n");
}

function syncMetadata() {
  if (!state.metadata) {
    state.metadata = buildBlankMetadata();
  }

  const fitted = enforceAspectBoundedGrid(
    state.rows,
    state.cols,
    state.imageWidth,
    state.imageHeight
  );
  state.rows = fitted.rows;
  state.cols = fitted.cols;
  state.tileSize = computeTileSizeFromGrid(
    state.imageWidth,
    state.imageHeight,
    state.rows,
    state.cols
  );

  state.metadata.map = {
    name: state.imageName,
    image_ref: state.imageName,
    image_width_px: state.imageWidth,
    image_height_px: state.imageHeight,
  };

  state.metadata.grid = {
    type: "square",
    origin: "bottom_left",
    tile_size_px: state.tileSize,
    rows: state.rows,
    cols: state.cols,
  };

  state.metadata.layers ||= {};
  state.metadata.layers.blocking = resizeBlockingGrid(
    state.metadata.layers.blocking || [],
    state.rows,
    state.cols
  );

  state.metadata.ai_annotation ||= {};
  state.metadata.ai_annotation.model = state.selectedModel;
  state.metadata.ai_annotation.scope = "blocking_only";

  metadataView.value = JSON.stringify(state.metadata, null, 2);
  rowsInput.value = state.rows;
  colsInput.value = state.cols;
  tileSizeInput.value = state.tileSize;

  statusEl.textContent = `${state.imageName} • ${state.imageWidth}x${state.imageHeight} • rows ${state.rows} • cols ${state.cols} • tile ${state.tileSize}px`;
  renderDraftMetrics();
  renderPromptView();
  renderModeButtons();
  renderCursorInfo();
}

function applyMetadataFromTextArea() {
  try {
    const parsed = JSON.parse(metadataView.value);
    state.metadata = parsed;

    const parsedRows = Number(parsed?.grid?.rows || state.rows);
    const parsedCols = Number(parsed?.grid?.cols || state.cols);
    const fitted = enforceAspectBoundedGrid(
      parsedRows,
      parsedCols,
      state.imageWidth,
      state.imageHeight
    );

    state.rows = fitted.rows;
    state.cols = fitted.cols;
    state.tileSize = computeTileSizeFromGrid(
      state.imageWidth,
      state.imageHeight,
      state.rows,
      state.cols
    );

    syncMetadata();
    draw();
    return true;
  } catch (err) {
    statusEl.textContent = `Metadata JSON parse error: ${err.message}`;
    return false;
  }
}

function sizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

function imageToScreen(x, y) {
  return {
    x: x * state.viewScale + state.viewX,
    y: y * state.viewScale + state.viewY,
  };
}

function screenToImage(x, y) {
  return {
    x: (x - state.viewX) / state.viewScale,
    y: (y - state.viewY) / state.viewScale,
  };
}

function pushHistory() {
  const grid = state.metadata?.layers?.blocking;
  if (!grid) return;

  state.historyUndo.push(deepCopyGrid(grid));
  if (state.historyUndo.length > 100) {
    state.historyUndo.shift();
  }
  state.historyRedo = [];
}

function undo() {
  if (!state.historyUndo.length || !state.metadata?.layers?.blocking) return;
  state.historyRedo.push(deepCopyGrid(state.metadata.layers.blocking));
  state.metadata.layers.blocking = state.historyUndo.pop();
  syncMetadata();
  draw();
}

function redo() {
  if (!state.historyRedo.length || !state.metadata?.layers?.blocking) return;
  state.historyUndo.push(deepCopyGrid(state.metadata.layers.blocking));
  state.metadata.layers.blocking = state.historyRedo.pop();
  syncMetadata();
  draw();
}

function fitView() {
  if (!state.imageLoaded) return;

  const padding = 20;
  const scaleX = (canvas.width - padding * 2) / state.imageWidth;
  const scaleY = (canvas.height - padding * 2) / state.imageHeight;
  state.viewScale = Math.max(0.1, Math.min(scaleX, scaleY));
  state.viewX = (canvas.width - state.imageWidth * state.viewScale) / 2;
  state.viewY = (canvas.height - state.imageHeight * state.viewScale) / 2;
  draw();
}

function draw() {
  sizeCanvas();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (state.imageLoaded) {
    const p = imageToScreen(0, 0);
    ctx.drawImage(
      hiddenImage,
      p.x,
      p.y,
      state.imageWidth * state.viewScale,
      state.imageHeight * state.viewScale
    );
  } else {
    ctx.fillStyle = "#f8fafc";
    ctx.font = "20px sans-serif";
    ctx.fillText("Upload a map image to begin", 20, 32);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1;

  for (let c = 0; c <= state.cols; c++) {
    const x = c * state.tileSize;
    const a = imageToScreen(x, 0);
    const b = imageToScreen(x, state.imageHeight);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (let r = 0; r <= state.rows; r++) {
    const y = state.imageHeight - r * state.tileSize;
    const a = imageToScreen(0, y);
    const b = imageToScreen(state.imageWidth, y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  const blocking = state.metadata?.layers?.blocking || [];
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (!blocking[r]?.[c]) continue;
      const x = c * state.tileSize;
      const y = state.imageHeight - (r + 1) * state.tileSize;
      const p = imageToScreen(x, y);
      const size = state.tileSize * state.viewScale;
      ctx.fillStyle = "rgba(220,38,38,0.38)";
      ctx.strokeStyle = "rgba(220,38,38,1)";
      ctx.fillRect(p.x, p.y, size, size);
      ctx.strokeRect(p.x, p.y, size, size);
    }
  }

  if (state.hoverTile) {
    const { r, c } = state.hoverTile;
    const x = c * state.tileSize;
    const y = state.imageHeight - (r + 1) * state.tileSize;
    const p = imageToScreen(x, y);
    const size = state.tileSize * state.viewScale;
    ctx.strokeStyle = "rgba(255,255,0,0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x, p.y, size, size);
  }
}

function syncFromGridDims(nextRows, nextCols) {
  const fitted = enforceAspectBoundedGrid(
    nextRows,
    nextCols,
    state.imageWidth,
    state.imageHeight
  );

  state.rows = fitted.rows;
  state.cols = fitted.cols;
  state.tileSize = computeTileSizeFromGrid(
    state.imageWidth,
    state.imageHeight,
    state.rows,
    state.cols
  );

  syncMetadata();
  draw();
}

function getTileAtClientPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  const img = screenToImage(sx, sy);

  if (img.x < 0 || img.y < 0 || img.x >= state.imageWidth || img.y >= state.imageHeight) {
    return null;
  }

  const c = Math.floor(img.x / state.tileSize);
  const r = Math.floor((state.imageHeight - img.y) / state.tileSize);

  if (c < 0 || c >= state.cols || r < 0 || r >= state.rows) return null;
  return { r, c };
}

function applyToolAtTile(r, c) {
  if (!state.metadata?.layers?.blocking) return;

  const current = state.metadata.layers.blocking[r][c];
  const nextValue = state.toolMode === "erase" ? false : true;

  if (current === nextValue) return;

  state.metadata.layers.blocking[r][c] = nextValue;
  syncMetadata();
  draw();
}

function exportMetadata() {
  const blob = new Blob([JSON.stringify(state.metadata, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const base = state.imageName.replace(/\.[^.]+$/, "");
  a.href = url;
  a.download = `${base}.tactical-map.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function saveMetadata() {
  if (!state.imageLoaded) return;
  if (!applyMetadataFromTextArea()) return;

  try {
    const res = await fetch(`/api/metadata/${encodeURIComponent(state.imageName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: state.metadata }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed");
    statusEl.textContent = `Saved ${state.imageName} metadata.`;
  } catch (err) {
    statusEl.textContent = `Save failed: ${err.message}`;
  }
}

async function draftAi() {
  if (!state.metadata) return;
  if (!applyMetadataFromTextArea()) return;

  state.selectedModel = modelSelect.value;
  state.lastDraftPrompt = buildClientPromptPreview();
  renderPromptView();

  statusEl.textContent = `Requesting AI draft with ${state.selectedModel}...`;

  try {
    const res = await fetch("/api/draft-blocking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: state.metadata,
        imageName: state.imageName,
        model: state.selectedModel,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "AI draft failed");

    state.metadata = data.metadata;
    state.lastDraftLog = data.draft_log || null;

    if (data.metadata?.ai_annotation?.model) {
      state.selectedModel = data.metadata.ai_annotation.model;
      if (modelSelect.querySelector(`option[value="${state.selectedModel}"]`)) {
        modelSelect.value = state.selectedModel;
      }
    }

    if (data.prompt_sent) {
      state.lastDraftPrompt = [
        `MODEL: ${data.draft_log?.model_used || state.selectedModel}`,
        "",
        "SYSTEM:",
        data.prompt_sent.system,
        "",
        "USER:",
        JSON.stringify(data.prompt_sent.user, null, 2),
      ].join("\n");
    }

    syncMetadata();
    draw();
  } catch (err) {
    statusEl.textContent = `AI draft failed: ${err.message}`;
  }
}

function loadImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function uploadMapFile(file) {
  const dims = await loadImageDimensions(file);
  const formData = new FormData();
  formData.append("mapImage", file);
  formData.append("imageWidth", String(dims.width));
  formData.append("imageHeight", String(dims.height));

  const res = await fetch("/api/upload-map", {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data;
}

function beginPan(clientX, clientY) {
  state.dragging = true;
  canvas.classList.add("dragging");
  state.dragStartX = clientX;
  state.dragStartY = clientY;
  state.dragViewX = state.viewX;
  state.dragViewY = state.viewY;
}

function endPan() {
  state.dragging = false;
  canvas.classList.remove("dragging");
}

imageInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  statusEl.textContent = "Uploading map...";

  try {
    const data = await uploadMapFile(file);

    state.imageName = data.imageName;
    state.imageUrl = data.imageUrl;
    state.metadata = data.metadata;
    state.imageWidth = data.metadata?.map?.image_width_px || state.imageWidth;
    state.imageHeight = data.metadata?.map?.image_height_px || state.imageHeight;

    const incomingRows = Number(data.metadata?.grid?.rows || 1);
    const incomingCols = Number(data.metadata?.grid?.cols || 1);
    const fitted = enforceAspectBoundedGrid(
      incomingRows,
      incomingCols,
      state.imageWidth,
      state.imageHeight
    );

    state.rows = fitted.rows;
    state.cols = fitted.cols;
    state.tileSize = computeTileSizeFromGrid(
      state.imageWidth,
      state.imageHeight,
      state.rows,
      state.cols
    );

    hiddenImage.onload = () => {
      state.imageLoaded = true;
      state.hoverTile = null;
      syncMetadata();
      fitView();
      statusEl.textContent = data.sidecarFound
        ? `Loaded ${state.imageName} with existing sidecar metadata.`
        : `Loaded ${state.imageName}; created blank sidecar metadata.`;
    };

    hiddenImage.src = data.imageUrl;
  } catch (err) {
    statusEl.textContent = `Upload failed: ${err.message}`;
  }
});

rowsInput.addEventListener("change", () => {
  syncFromGridDims(Number(rowsInput.value || 1), Number(colsInput.value || 1));
});

colsInput.addEventListener("change", () => {
  syncFromGridDims(Number(rowsInput.value || 1), Number(colsInput.value || 1));
});

exportBtn.addEventListener("click", exportMetadata);
saveBtn.addEventListener("click", saveMetadata);
draftAiBtn.addEventListener("click", draftAi);
undoBtn.addEventListener("click", undo);
redoBtn.addEventListener("click", redo);
fitViewBtn.addEventListener("click", fitView);
metadataView.addEventListener("change", applyMetadataFromTextArea);

modePaintBtn.addEventListener("click", () => {
  state.toolMode = "paint";
  renderModeButtons();
});
modeEraseBtn.addEventListener("click", () => {
  state.toolMode = "erase";
  renderModeButtons();
});
modePanBtn.addEventListener("click", () => {
  state.toolMode = "pan";
  renderModeButtons();
});

modelSelect.addEventListener("change", () => {
  state.selectedModel = modelSelect.value;
  if (state.metadata?.ai_annotation) {
    state.metadata.ai_annotation.model = state.selectedModel;
    metadataView.value = JSON.stringify(state.metadata, null, 2);
  }
  renderPromptView();
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("mousedown", (e) => {
  const tile = getTileAtClientPoint(e.clientX, e.clientY);
  state.hoverTile = tile;
  renderCursorInfo();

  const wantsPan = state.toolMode === "pan" || state.spacePan;

  if (e.button === 0 && wantsPan) {
    beginPan(e.clientX, e.clientY);
    return;
  }

  if (e.button === 0 && !wantsPan && (state.toolMode === "paint" || state.toolMode === "erase")) {
    if (!tile) return;
    pushHistory();
    state.paintDragging = true;
    applyToolAtTile(tile.r, tile.c);
  }
});

canvas.addEventListener("mousemove", (e) => {
  const tile = getTileAtClientPoint(e.clientX, e.clientY);
  state.hoverTile = tile;
  renderCursorInfo();

  if (state.dragging) {
    const dx = e.clientX - state.dragStartX;
    const dy = e.clientY - state.dragStartY;
    state.viewX = state.dragViewX + dx;
    state.viewY = state.dragViewY + dy;
    draw();
    return;
  }

  if (state.paintDragging && tile) {
    applyToolAtTile(tile.r, tile.c);
    return;
  }

  draw();
});

window.addEventListener("mouseup", () => {
  endPan();
  state.paintDragging = false;
});

canvas.addEventListener("mouseleave", () => {
  endPan();
  state.paintDragging = false;
  state.hoverTile = null;
  renderCursorInfo();
  draw();
});

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const before = screenToImage(sx, sy);
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const nextScale = clamp(state.viewScale * factor, 0.2, 6);
    state.viewScale = nextScale;
    state.viewX = sx - before.x * nextScale;
    state.viewY = sy - before.y * nextScale;
    draw();
  },
  { passive: false }
);

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    state.spacePan = true;
    renderModeButtons();
    e.preventDefault();
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
    e.preventDefault();
    redo();
    return;
  }

  if (e.key.toLowerCase() === "p") {
    state.toolMode = "paint";
    renderModeButtons();
  } else if (e.key.toLowerCase() === "e") {
    state.toolMode = "erase";
    renderModeButtons();
  } else if (e.key.toLowerCase() === "h") {
    state.toolMode = "pan";
    renderModeButtons();
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    state.spacePan = false;
    renderModeButtons();
  }
});

window.addEventListener("resize", () => {
  draw();
  if (state.imageLoaded) {
    renderModeButtons();
  }
});

const initialDefault = computeDefaultGridForImage(state.imageWidth, state.imageHeight);
state.rows = initialDefault.rows;
state.cols = initialDefault.cols;
state.tileSize = computeTileSizeFromGrid(
  state.imageWidth,
  state.imageHeight,
  state.rows,
  state.cols
);

state.metadata = buildBlankMetadata();
syncMetadata();
draw();