const imageInput = document.getElementById("imageInput");
const tileSizeInput = document.getElementById("tileSizeInput");
const rowsInput = document.getElementById("rowsInput");
const colsInput = document.getElementById("colsInput");
const draftAiBtn = document.getElementById("draftAiBtn");
const modelSelect = document.getElementById("modelSelect");
const overlayModeSelect = document.getElementById("overlayModeSelect");
const saveBtn = document.getElementById("saveBtn");
const exportBtn = document.getElementById("exportBtn");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const fitViewBtn = document.getElementById("fitViewBtn");
const prevCaseBtn = document.getElementById("prevCaseBtn");
const nextCaseBtn = document.getElementById("nextCaseBtn");
const saveNextBtn = document.getElementById("saveNextBtn");
const nextNeedsReviewBtn = document.getElementById("nextNeedsReviewBtn");
const refreshDashboardBtn = document.getElementById("refreshDashboardBtn");
const acceptAiBtn = document.getElementById("acceptAiBtn");
const clearAiBtn = document.getElementById("clearAiBtn");

const modePaintBtn = document.getElementById("modePaintBtn");
const modeEraseBtn = document.getElementById("modeEraseBtn");
const modeAmbiguousBtn = document.getElementById("modeAmbiguousBtn");
const modePanBtn = document.getElementById("modePanBtn");

const labelerInput = document.getElementById("labelerInput");
const reviewStatusSelect = document.getElementById("reviewStatusSelect");
const notesInput = document.getElementById("notesInput");

const caseFilterSelect = document.getElementById("caseFilterSelect");
const caseSortSelect = document.getElementById("caseSortSelect");
const caseListEl = document.getElementById("caseList");
const summaryMetricsEl = document.getElementById("summaryMetrics");
const mapMetricsEl = document.getElementById("mapMetrics");

const statusEl = document.getElementById("status");
const draftMetricsEl = document.getElementById("draftMetrics");
const cursorInfoEl = document.getElementById("cursorInfo");
const caseInfoEl = document.getElementById("caseInfo");
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
  overlayMode: "human",

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

  toolMode: "paint",
  spacePan: false,
  paintDragging: false,
  hoverTile: null,
  _lastPaintTile: null,

  historyUndo: [],
  historyRedo: [],

  mapList: [],
  currentMapIndex: -1,
  caseSummaries: [],
};

const {
  makeGrid,
  normalizeMapMetadata,
  validateNormalizedMapMetadata,
  serializeMapMetadata
} = window.MapMetadata;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function deepCopyGrid(grid) {
  return grid.map((row) => [...row]);
}

function countTrue(grid) {
  let total = 0;
  for (const row of grid || []) {
    for (const cell of row || []) {
      if (cell) total += 1;
    }
  }
  return total;
}

function countAiOnly(human, ai) {
  let total = 0;
  for (let r = 0; r < Math.max(human.length, ai.length); r++) {
    const hr = human[r] || [];
    const ar = ai[r] || [];
    for (let c = 0; c < Math.max(hr.length, ar.length); c++) {
      if (!Boolean(hr[c]) && Boolean(ar[c])) total += 1;
    }
  }
  return total;
}

function countHumanOnly(human, ai) {
  let total = 0;
  for (let r = 0; r < Math.max(human.length, ai.length); r++) {
    const hr = human[r] || [];
    const ar = ai[r] || [];
    for (let c = 0; c < Math.max(hr.length, ar.length); c++) {
      if (Boolean(hr[c]) && !Boolean(ar[c])) total += 1;
    }
  }
  return total;
}

function countAgreement(human, ai) {
  let total = 0;
  for (let r = 0; r < Math.max(human.length, ai.length); r++) {
    const hr = human[r] || [];
    const ar = ai[r] || [];
    for (let c = 0; c < Math.max(hr.length, ar.length); c++) {
      if (Boolean(hr[c]) === Boolean(ar[c])) total += 1;
    }
  }
  return total;
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

function resizeGrid(prevGrid, rows, cols) {
  const next = makeGrid(rows, cols, false);
  for (let r = 0; r < Math.min(rows, prevGrid.length); r++) {
    for (let c = 0; c < Math.min(cols, prevGrid[r]?.length || 0); c++) {
      next[r][c] = Boolean(prevGrid[r][c]);
    }
  }
  return next;
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

  const normalized = normalizeMapMetadata(null, {
    imageName: state.imageName,
    imageWidth: state.imageWidth,
    imageHeight: state.imageHeight,
  });

  normalized.grid.rows = state.rows;
  normalized.grid.cols = state.cols;
  normalized.grid.tileSizePx = state.tileSize;

  normalized.layers.blocking = makeGrid(state.rows, state.cols, false);

  normalized.annotation.ai.status = "none";
  normalized.annotation.ai.model = state.selectedModel;
  normalized.annotation.ai.scope = "blocking_only";
  normalized.annotation.ai.notes = [];

  normalized.annotation.review.labelSource = "human_gold";
  normalized.annotation.review.labeler = "";
  normalized.annotation.review.reviewStatus = "in_progress";
  normalized.annotation.review.reviewer = null;
  normalized.annotation.review.blockingRuleVersion = "v1";
  normalized.annotation.review.createdAt = new Date().toISOString();
  normalized.annotation.review.updatedAt = new Date().toISOString();
  normalized.annotation.review.notes = "";

  normalized.extensions.tacticsCanvas = {
    ai_blocking: makeGrid(state.rows, state.cols, false),
    ambiguous: makeGrid(state.rows, state.cols, false),
  };

  return normalized;
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
  modeAmbiguousBtn.classList.toggle("active", state.toolMode === "ambiguous");
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
  const human = state.metadata?.layers?.blocking?.[r]?.[c] ? "true" : "false";
  const ai = state.metadata?.layers?.ai_blocking?.[r]?.[c] ? "true" : "false";
  const ambiguous = state.metadata?.layers?.ambiguous?.[r]?.[c] ? "true" : "false";

  cursorInfoEl.textContent = [
    `Row: ${r}`,
    `Col: ${c}`,
    `Human: ${human}`,
    `AI: ${ai}`,
    `Ambiguous: ${ambiguous}`,
    `Mode: ${state.toolMode}`,
    `Overlay: ${state.overlayMode}`,
  ].join("\n");
}

function renderCaseInfo() {
  if (!state.mapList.length || state.currentMapIndex < 0) {
    caseInfoEl.textContent = "No case loaded.";
    return;
  }

  caseInfoEl.textContent = [
    `Map: ${state.imageName}`,
    `Case ${state.currentMapIndex + 1} / ${state.mapList.length}`,
  ].join("\n");
}

function renderMapMetrics() {
  if (!state.metadata?.layers) {
    mapMetricsEl.textContent = "No map loaded.";
    return;
  }

  const human = state.metadata.layers.blocking || [];
  const ai = state.metadata.layers.ai_blocking || [];
  const ambiguous = state.metadata.layers.ambiguous || [];

  const humanCount = countTrue(human);
  const aiCount = countTrue(ai);
  const aiOnly = countAiOnly(human, ai);
  const humanOnly = countHumanOnly(human, ai);
  const ambiguousCount = countTrue(ambiguous);
  const disagreement = aiOnly + humanOnly;

  mapMetricsEl.textContent = [
    `Human blocking: ${humanCount}`,
    `AI blocking: ${aiCount}`,
    `AI only: ${aiOnly}`,
    `Human only: ${humanOnly}`,
    `Disagreement: ${disagreement}`,
    `Ambiguous: ${ambiguousCount}`,
  ].join("\n");
}

function getFilteredSortedCases() {
  let rows = [...state.caseSummaries];

  const filterValue = caseFilterSelect.value;
  if (filterValue !== "all") {
    rows = rows.filter((r) => r.review_status === filterValue);
  }

  const sortValue = caseSortSelect.value;
  if (sortValue === "name") {
    rows.sort((a, b) => a.imageName.localeCompare(b.imageName));
  } else if (sortValue === "disagreement") {
    rows.sort((a, b) => b.disagreement_count - a.disagreement_count || a.imageName.localeCompare(b.imageName));
  } else if (sortValue === "ambiguous") {
    rows.sort((a, b) => b.ambiguous_count - a.ambiguous_count || a.imageName.localeCompare(b.imageName));
  } else if (sortValue === "review_status") {
    rows.sort((a, b) => a.review_status.localeCompare(b.review_status) || a.imageName.localeCompare(b.imageName));
  }

  return rows;
}

function renderSummaryMetrics() {
  if (!state.caseSummaries.length) {
    summaryMetricsEl.textContent = "No summary loaded.";
    return;
  }

  const total = state.caseSummaries.length;
  const inProgress = state.caseSummaries.filter((c) => c.review_status === "in_progress").length;
  const needsReview = state.caseSummaries.filter((c) => c.review_status === "needs_review").length;
  const approved = state.caseSummaries.filter((c) => c.review_status === "approved").length;
  const totalDisagreement = state.caseSummaries.reduce((sum, c) => sum + c.disagreement_count, 0);
  const totalAmbiguous = state.caseSummaries.reduce((sum, c) => sum + c.ambiguous_count, 0);
  const avgDisagreement = total ? (totalDisagreement / total).toFixed(1) : "0.0";

  summaryMetricsEl.textContent = [
    `Total maps: ${total}`,
    `In Progress: ${inProgress}`,
    `Needs Review: ${needsReview}`,
    `Approved: ${approved}`,
    `Avg disagreement: ${avgDisagreement}`,
    `Total ambiguous: ${totalAmbiguous}`,
  ].join("\n");
}

function renderCaseList() {
  const rows = getFilteredSortedCases();
  caseListEl.innerHTML = "";

  if (!rows.length) {
    caseListEl.innerHTML = `<div class="case-list-item"><div class="case-list-meta">No cases match current filter.</div></div>`;
    return;
  }

  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "case-list-item";
    if (row.imageName === state.imageName) item.classList.add("active");

    item.innerHTML = `
      <div class="case-list-title">${row.imageName}</div>
      <div class="case-list-meta">status=${row.review_status}
labeler=${row.labeler || "-"}
disagree=${row.disagreement_count}
ambiguous=${row.ambiguous_count}</div>
    `;

    item.addEventListener("click", async () => {
      await loadMapByName(row.imageName);
    });

    caseListEl.appendChild(item);
  }
}

function syncWorkflowFieldsFromMetadata() {
  if (!state.metadata) return;
  labelerInput.value = state.metadata?.label_source?.labeler || "";
  reviewStatusSelect.value = state.metadata?.label_source?.review_status || "in_progress";
  notesInput.value = state.metadata?.case_metadata?.notes || "";
}

function syncMetadataFromWorkflowFields() {
  if (!state.metadata) return;

  state.metadata.label_source ||= {};
  state.metadata.label_source.status = "human_gold";
  state.metadata.label_source.labeler = labelerInput.value || "";
  state.metadata.label_source.review_status = reviewStatusSelect.value || "in_progress";
  state.metadata.label_source.reviewer ??= null;
  state.metadata.label_source.blocking_rule_version ||= "v1";
  state.metadata.label_source.created_at ||= new Date().toISOString();
  state.metadata.label_source.updated_at = new Date().toISOString();

  state.metadata.case_metadata ||= {};
  state.metadata.case_metadata.notes = notesInput.value || "";
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
  state.metadata.layers.blocking = resizeGrid(
    state.metadata.layers.blocking || [],
    state.rows,
    state.cols
  );
  state.metadata.layers.ai_blocking = resizeGrid(
    state.metadata.layers.ai_blocking || [],
    state.rows,
    state.cols
  );
  state.metadata.layers.ambiguous = resizeGrid(
    state.metadata.layers.ambiguous || [],
    state.rows,
    state.cols
  );

  state.metadata.ai_annotation ||= {};
  state.metadata.ai_annotation.model = state.selectedModel;
  state.metadata.ai_annotation.scope = "blocking_only";

  syncMetadataFromWorkflowFields();

  metadataView.value = JSON.stringify(state.metadata, null, 2);
  rowsInput.value = state.rows;
  colsInput.value = state.cols;
  tileSizeInput.value = state.tileSize;
  overlayModeSelect.value = state.overlayMode;

  statusEl.textContent = `${state.imageName} • ${state.imageWidth}x${state.imageHeight} • rows ${state.rows} • cols ${state.cols} • tile ${state.tileSize}px`;
  renderDraftMetrics();
  renderPromptView();
  renderModeButtons();
  renderCursorInfo();
  renderCaseInfo();
  renderMapMetrics();
  renderCaseList();
  renderSummaryMetrics();
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

    syncWorkflowFieldsFromMetadata();
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
  if (!state.metadata?.layers) return;

  state.historyUndo.push({
    blocking: deepCopyGrid(state.metadata.layers.blocking || []),
    ambiguous: deepCopyGrid(state.metadata.layers.ambiguous || []),
  });

  if (state.historyUndo.length > 100) {
    state.historyUndo.shift();
  }
  state.historyRedo = [];
}

function undo() {
  if (!state.historyUndo.length || !state.metadata?.layers) return;

  state.historyRedo.push({
    blocking: deepCopyGrid(state.metadata.layers.blocking || []),
    ambiguous: deepCopyGrid(state.metadata.layers.ambiguous || []),
  });

  const prev = state.historyUndo.pop();
  state.metadata.layers.blocking = prev.blocking;
  state.metadata.layers.ambiguous = prev.ambiguous;
  syncMetadata();
  draw();
}

function redo() {
  if (!state.historyRedo.length || !state.metadata?.layers) return;

  state.historyUndo.push({
    blocking: deepCopyGrid(state.metadata.layers.blocking || []),
    ambiguous: deepCopyGrid(state.metadata.layers.ambiguous || []),
  });

  const next = state.historyRedo.pop();
  state.metadata.layers.blocking = next.blocking;
  state.metadata.layers.ambiguous = next.ambiguous;
  syncMetadata();
  draw();
}

function fitView() {
  if (!state.imageLoaded) return;

  sizeCanvas();
  const padding = 20;
  const scaleX = (canvas.width - padding * 2) / state.imageWidth;
  const scaleY = (canvas.height - padding * 2) / state.imageHeight;
  state.viewScale = Math.max(0.1, Math.min(scaleX, scaleY));
  state.viewX = (canvas.width - state.imageWidth * state.viewScale) / 2;
  state.viewY = (canvas.height - state.imageHeight * state.viewScale) / 2;
  draw();
}

function drawTileRect(r, c, fillStyle, strokeStyle = null, lineWidth = 1) {
  const x = c * state.tileSize;
  const y = state.imageHeight - (r + 1) * state.tileSize;
  const p = imageToScreen(x, y);
  const size = state.tileSize * state.viewScale;

  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fillRect(p.x, p.y, size, size);
  }

  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(p.x, p.y, size, size);
  }
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

  const human = state.metadata?.layers?.blocking || [];
  const ai = state.metadata?.layers?.ai_blocking || [];
  const ambiguous = state.metadata?.layers?.ambiguous || [];

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const humanVal = Boolean(human[r]?.[c]);
      const aiVal = Boolean(ai[r]?.[c]);
      const ambiguousVal = Boolean(ambiguous[r]?.[c]);

      if (state.overlayMode === "human") {
        if (humanVal) {
          drawTileRect(r, c, "rgba(220,38,38,0.38)", "rgba(220,38,38,1)");
        }
      } else if (state.overlayMode === "ai") {
        if (aiVal) {
          drawTileRect(r, c, "rgba(249,115,22,0.38)", "rgba(249,115,22,1)");
        }
      } else if (state.overlayMode === "diff") {
        if (humanVal && aiVal) {
          drawTileRect(r, c, "rgba(220,38,38,0.30)", "rgba(220,38,38,0.95)");
        } else if (aiVal && !humanVal) {
          drawTileRect(r, c, "rgba(249,115,22,0.40)", "rgba(249,115,22,1)");
        } else if (humanVal && !aiVal) {
          drawTileRect(r, c, "rgba(59,130,246,0.40)", "rgba(59,130,246,1)");
        }
      } else if (state.overlayMode === "ambiguous") {
        if (ambiguousVal) {
          drawTileRect(r, c, "rgba(168,85,247,0.38)", "rgba(168,85,247,1)");
        }
      } else if (state.overlayMode === "all") {
        if (humanVal) {
          drawTileRect(r, c, "rgba(220,38,38,0.28)", null);
        }
        if (aiVal && !humanVal) {
          drawTileRect(r, c, "rgba(249,115,22,0.28)", null);
        }
        if (ambiguousVal) {
          drawTileRect(r, c, null, "rgba(168,85,247,1)", 2);
        }
      }
    }
  }

  if (state.hoverTile) {
    drawTileRect(state.hoverTile.r, state.hoverTile.c, null, "rgba(255,255,0,0.95)", 2);
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
  if (!state.metadata?.layers) return;

  if (state.toolMode === "paint") {
    if (state.metadata.layers.blocking[r][c] === true) return;
    state.metadata.layers.blocking[r][c] = true;
  } else if (state.toolMode === "erase") {
    if (state.metadata.layers.blocking[r][c] === false) return;
    state.metadata.layers.blocking[r][c] = false;
  } else if (state.toolMode === "ambiguous") {
    state.metadata.layers.ambiguous[r][c] = !state.metadata.layers.ambiguous[r][c];
  } else {
    return;
  }

  syncMetadata();
  draw();
}

function acceptAiDraft() {
  if (!state.metadata?.layers?.ai_blocking) return;
  const ok = window.confirm("Replace human blocking layer with the current AI draft?");
  if (!ok) return;

  pushHistory();
  state.metadata.layers.blocking = deepCopyGrid(state.metadata.layers.ai_blocking);
  syncMetadata();
  draw();
}

function clearAiDraft() {
  if (!state.metadata?.layers?.ai_blocking) return;
  const ok = window.confirm("Clear the AI draft layer?");
  if (!ok) return;

  state.metadata.layers.ai_blocking = makeGrid(state.rows, state.cols, false);
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

  syncMetadataFromWorkflowFields();

  try {
    const res = await fetch(`/api/metadata/${encodeURIComponent(state.imageName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: state.metadata }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed");
    statusEl.textContent = `Saved ${state.imageName} metadata.`;
    metadataView.value = JSON.stringify(state.metadata, null, 2);
    await fetchCaseSummary();
  } catch (err) {
    statusEl.textContent = `Save failed: ${err.message}`;
    throw err;
  }
}

async function saveAndNext() {
  await saveMetadata();
  await goToRelativeCase(1);
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

    syncWorkflowFieldsFromMetadata();
    syncMetadata();
    draw();
    await fetchCaseSummary();
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

async function fetchMapList() {
  const res = await fetch("/api/maps");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load map list");
  state.mapList = data.maps || [];
  if (state.imageName && state.mapList.includes(state.imageName)) {
    state.currentMapIndex = state.mapList.indexOf(state.imageName);
  }
  renderCaseInfo();
}

async function fetchCaseSummary() {
  const res = await fetch("/api/case-summary");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load case summary");
  state.caseSummaries = data.cases || [];
  renderSummaryMetrics();
  renderCaseList();
}

async function loadMapByName(imageName) {
  state.imageName = imageName;
  state.imageUrl = `/maps/${encodeURIComponent(imageName)}`;

  const metadataRes = await fetch(`/api/metadata/${encodeURIComponent(imageName)}`);
  const metadataData = await metadataRes.json();
  if (!metadataRes.ok) throw new Error(metadataData.error || "Failed to load metadata");

  state.metadata = metadataData.metadata;
  state.imageWidth = state.metadata?.map?.image_width_px || state.imageWidth;
  state.imageHeight = state.metadata?.map?.image_height_px || state.imageHeight;
  state.rows = state.metadata?.grid?.rows || state.rows;
  state.cols = state.metadata?.grid?.cols || state.cols;
  state.tileSize = state.metadata?.grid?.tile_size_px || state.tileSize;

  if (state.mapList.includes(imageName)) {
    state.currentMapIndex = state.mapList.indexOf(imageName);
  }

  hiddenImage.onload = () => {
    state.imageLoaded = true;
    state.hoverTile = null;
    state.historyUndo = [];
    state.historyRedo = [];
    syncWorkflowFieldsFromMetadata();
    syncMetadata();
    fitView();
    statusEl.textContent = `Loaded ${state.imageName}.`;
  };

  hiddenImage.src = state.imageUrl;
}

async function goToRelativeCase(delta) {
  if (!state.mapList.length) return;
  let nextIndex = state.currentMapIndex + delta;
  nextIndex = clamp(nextIndex, 0, state.mapList.length - 1);
  if (nextIndex === state.currentMapIndex) return;
  await loadMapByName(state.mapList[nextIndex]);
}

async function goToNextNeedsReview() {
  if (!state.caseSummaries.length) return;

  const candidates = state.caseSummaries
    .filter((c) => c.review_status === "needs_review" || c.review_status === "in_progress")
    .sort((a, b) => {
      if (b.disagreement_count !== a.disagreement_count) {
        return b.disagreement_count - a.disagreement_count;
      }
      return a.imageName.localeCompare(b.imageName);
    });

  if (!candidates.length) return;

  const currentIdx = candidates.findIndex((c) => c.imageName === state.imageName);
  const target = currentIdx >= 0 && currentIdx < candidates.length - 1
    ? candidates[currentIdx + 1]
    : candidates[0];

  await loadMapByName(target.imageName);
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

    await fetchMapList();
    await fetchCaseSummary();

    hiddenImage.onload = () => {
      state.imageLoaded = true;
      state.hoverTile = null;
      state.historyUndo = [];
      state.historyRedo = [];
      syncWorkflowFieldsFromMetadata();
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

labelerInput.addEventListener("input", () => {
  syncMetadataFromWorkflowFields();
  metadataView.value = JSON.stringify(state.metadata, null, 2);
  renderCaseList();
});

reviewStatusSelect.addEventListener("change", () => {
  syncMetadataFromWorkflowFields();
  metadataView.value = JSON.stringify(state.metadata, null, 2);
  renderCaseList();
});

notesInput.addEventListener("input", () => {
  syncMetadataFromWorkflowFields();
  metadataView.value = JSON.stringify(state.metadata, null, 2);
});

overlayModeSelect.addEventListener("change", () => {
  state.overlayMode = overlayModeSelect.value;
  renderCursorInfo();
  draw();
});

caseFilterSelect.addEventListener("change", () => renderCaseList());
caseSortSelect.addEventListener("change", () => renderCaseList());

exportBtn.addEventListener("click", exportMetadata);
saveBtn.addEventListener("click", () => saveMetadata());
saveNextBtn.addEventListener("click", () => saveAndNext());
draftAiBtn.addEventListener("click", draftAi);

undoBtn.addEventListener("click", undo);
redoBtn.addEventListener("click", redo);
fitViewBtn.addEventListener("click", fitView);

prevCaseBtn.addEventListener("click", () => goToRelativeCase(-1));
nextCaseBtn.addEventListener("click", () => goToRelativeCase(1));
nextNeedsReviewBtn.addEventListener("click", () => goToNextNeedsReview());
refreshDashboardBtn.addEventListener("click", () => fetchCaseSummary());

acceptAiBtn.addEventListener("click", acceptAiDraft);
clearAiBtn.addEventListener("click", clearAiDraft);

metadataView.addEventListener("change", applyMetadataFromTextArea);

modePaintBtn.addEventListener("click", () => {
  state.toolMode = "paint";
  renderModeButtons();
});

modeEraseBtn.addEventListener("click", () => {
  state.toolMode = "erase";
  renderModeButtons();
});

modeAmbiguousBtn.addEventListener("click", () => {
  state.toolMode = "ambiguous";
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

  if (
    e.button === 0 &&
    !wantsPan &&
    (state.toolMode === "paint" || state.toolMode === "erase" || state.toolMode === "ambiguous")
  ) {
    if (!tile) return;
    pushHistory();
    state.paintDragging = true;
    state._lastPaintTile = tile;
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
    const last = state._lastPaintTile;
    if (!last || last.r !== tile.r || last.c !== tile.c) {
      state._lastPaintTile = tile;
      applyToolAtTile(tile.r, tile.c);
    }
    return;
  }

  draw();
});

window.addEventListener("mouseup", () => {
  endPan();
  state.paintDragging = false;
  state._lastPaintTile = null;
});

canvas.addEventListener("mouseleave", () => {
  endPan();
  state.paintDragging = false;
  state._lastPaintTile = null;
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

  if (
    (e.ctrlKey || e.metaKey) &&
    (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))
  ) {
    e.preventDefault();
    redo();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveMetadata();
    return;
  }

  if (e.key.toLowerCase() === "p") {
    state.toolMode = "paint";
    renderModeButtons();
  } else if (e.key.toLowerCase() === "e") {
    state.toolMode = "erase";
    renderModeButtons();
  } else if (e.key.toLowerCase() === "u") {
    state.toolMode = "ambiguous";
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
  if (state.imageLoaded) renderModeButtons();
});

async function initialize() {
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

  try {
    await fetchMapList();
    await fetchCaseSummary();
  } catch (err) {
    console.warn(err);
  }
}

initialize();
