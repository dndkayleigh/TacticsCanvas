const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const MAP_DIR = path.join(__dirname, "data", "maps");
const LOG_DIR = path.join(__dirname, "data", "logs");
const AI_LOG_PATH = path.join(LOG_DIR, "ai-draft-log.ndjson");

fs.mkdirSync(MAP_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.json({ limit: "50mb" }));
app.use(express.static(PUBLIC_DIR));
app.use("/maps", express.static(MAP_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MAP_DIR),
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

function appendAiLog(entry) {
  fs.appendFileSync(AI_LOG_PATH, JSON.stringify(entry) + "\n", "utf8");
}

function sidecarPathForImageName(imageName) {
  const ext = path.extname(imageName);
  const base = path.basename(imageName, ext);
  return path.join(MAP_DIR, `${base}.tactical-map.json`);
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

function computeDefaultGridForImage(width, height) {
  if (width >= height) {
    const cols = 40;
    const rows = Math.max(1, Math.min(40, Math.round((height / width) * cols)));
    return { rows, cols };
  } else {
    const rows = 40;
    const cols = Math.max(1, Math.min(40, Math.round((width / height) * rows)));
    return { rows, cols };
  }
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

function mapUiModelToApiModel(model) {
  const mapping = {
    "gpt-4-mini": "gpt-4.1-mini",
    "gpt-4": "gpt-4.1",
    "gpt-5": "gpt-5",
  };
  return mapping[model] || "gpt-4.1-mini";
}

function detectMimeType(imageName) {
  const ext = path.extname(imageName).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

function imageFileToDataUrl(imageName) {
  const filePath = path.join(MAP_DIR, imageName);
  const bytes = fs.readFileSync(filePath);
  const mime = detectMimeType(imageName);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function buildBlockingJsonSchema(rows, cols) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      blocking: {
        type: "array",
        minItems: rows,
        maxItems: rows,
        items: {
          type: "array",
          minItems: cols,
          maxItems: cols,
          items: { type: "boolean" },
        },
      },
      notes: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["blocking", "notes"],
  };
}

function normalizeBlockingGrid(blocking, rows, cols) {
  const next = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false)
  );

  for (let r = 0; r < Math.min(rows, blocking?.length || 0); r++) {
    for (let c = 0; c < Math.min(cols, blocking[r]?.length || 0); c++) {
      next[r][c] = Boolean(blocking[r][c]);
    }
  }
  return next;
}

async function draftBlockingWithOpenAI({ metadata, model }) {
  const apiModel = mapUiModelToApiModel(model);
  const rows = metadata.grid.rows;
  const cols = metadata.grid.cols;
  const imageDataUrl = imageFileToDataUrl(metadata.map.image_ref);

  const systemPrompt =
    "You are drafting tactical RPG map metadata. Return only a blocking tile grid for walls and solid barriers. Do not mark cover, difficult terrain, hazards, elevation, furniture, or decorative art unless the tile is clearly impassable. Use the provided bottom-left grid convention.";

  const userPayload = {
    task: "draft_blocking_tiles_only",
    image_ref: metadata.map.image_ref,
    image_width_px: metadata.map.image_width_px,
    image_height_px: metadata.map.image_height_px,
    grid: metadata.grid,
    coordinate_system:
      "Rows are indexed from the bottom of the image upward. Cols are indexed from the left of the image to the right.",
    instructions: [
      "Return a blocking matrix sized exactly rows x cols.",
      "true means the tile is blocked by a wall or other impassable barrier.",
      "false means the tile is not blocked.",
      "Be conservative. Prefer false unless there is clear visual evidence of a wall/barrier.",
    ],
  };

  const response = await openai.responses.create({
    model: apiModel,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: systemPrompt }],
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: JSON.stringify(userPayload) },
          { type: "input_image", image_url: imageDataUrl, detail: "high" },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "blocking_draft",
        schema: buildBlockingJsonSchema(rows, cols),
        strict: true,
      },
    },
  });

  const parsed = JSON.parse(response.output_text);

  return {
    apiModel,
    response,
    blocking: normalizeBlockingGrid(parsed.blocking, rows, cols),
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    promptSent: {
      system: systemPrompt,
      user: userPayload,
    },
  };
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    app: "tactical-map-editor",
    ai: process.env.OPENAI_API_KEY ? "openai" : "missing_api_key",
  });
});

app.get("/api/maps", (req, res) => {
  try {
    const files = fs.readdirSync(MAP_DIR);
    const imageFiles = files
      .filter((name) => /\.(png|jpg|jpeg|webp|gif)$/i.test(name))
      .sort((a, b) => a.localeCompare(b));

    res.json({ maps: imageFiles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list maps." });
  }
});

app.get("/api/case-summary", (req, res) => {
  try {
    const files = fs.readdirSync(MAP_DIR);
    const imageFiles = files
      .filter((name) => /\.(png|jpg|jpeg|webp|gif)$/i.test(name))
      .sort((a, b) => a.localeCompare(b));

    const summaries = imageFiles.map((imageName) => {
      const sidecarPath = sidecarPathForImageName(imageName);
      let metadata = ensureMetadataShape({}, imageName, 1200, 800);

      if (fs.existsSync(sidecarPath)) {
        const loaded = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
        const width = loaded?.map?.image_width_px || 1200;
        const height = loaded?.map?.image_height_px || 800;
        metadata = ensureMetadataShape(loaded, imageName, width, height);
      }

      const human = metadata.layers.blocking || [];
      const ai = metadata.layers.ai_blocking || [];
      const ambiguous = metadata.layers.ambiguous || [];

      return {
        imageName,
        review_status: metadata.label_source?.review_status || "in_progress",
        labeler: metadata.label_source?.labeler || "",
        human_blocking_count: countTrue(human),
        ai_blocking_count: countTrue(ai),
        agreement_count: countAgreement(human, ai),
        ai_only_count: countAiOnly(human, ai),
        human_only_count: countHumanOnly(human, ai),
        disagreement_count: countAiOnly(human, ai) + countHumanOnly(human, ai),
        ambiguous_count: countTrue(ambiguous),
      };
    });

    res.json({ cases: summaries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to build case summary." });
  }
});

app.post("/api/upload-map", upload.single("mapImage"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded." });

    const imageName = req.file.originalname;
    const imageUrl = `/maps/${encodeURIComponent(imageName)}`;
    const sidecarPath = sidecarPathForImageName(imageName);

    const width = Number(req.body.imageWidth || 1200);
    const height = Number(req.body.imageHeight || 800);

    let metadata;
    let sidecarFound = false;

    if (fs.existsSync(sidecarPath)) {
      metadata = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
      metadata = ensureMetadataShape(metadata, imageName, width, height);
      sidecarFound = true;
    } else {
      metadata = ensureMetadataShape({}, imageName, width, height);
      fs.writeFileSync(sidecarPath, JSON.stringify(metadata, null, 2), "utf8");
    }

    res.json({ imageName, imageUrl, sidecarFound, metadata });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload map." });
  }
});

app.get("/api/metadata/:imageName", (req, res) => {
  try {
    const imageName = req.params.imageName;
    const imagePath = path.join(MAP_DIR, imageName);
    const sidecarPath = sidecarPathForImageName(imageName);

    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: "Image not found." });
    }

    let width = 1200;
    let height = 800;

    if (fs.existsSync(sidecarPath)) {
      const metadata = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
      width = metadata?.map?.image_width_px || width;
      height = metadata?.map?.image_height_px || height;
      const normalized = ensureMetadataShape(metadata, imageName, width, height);
      return res.json({ metadata: normalized });
    }

    const metadata = ensureMetadataShape({}, imageName, width, height);
    res.json({ metadata });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load metadata." });
  }
});

app.post("/api/metadata/:imageName", (req, res) => {
  try {
    const imageName = req.params.imageName;
    let metadata = req.body.metadata;
    if (!metadata) return res.status(400).json({ error: "Missing metadata." });

    const width = metadata?.map?.image_width_px || 1200;
    const height = metadata?.map?.image_height_px || 800;

    metadata = ensureMetadataShape(metadata, imageName, width, height);
    metadata.label_source.updated_at = nowIso();

    const sidecarPath = sidecarPathForImageName(imageName);
    fs.writeFileSync(sidecarPath, JSON.stringify(metadata, null, 2), "utf8");
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save metadata." });
  }
});

app.post("/api/draft-blocking", async (req, res) => {
  const startedAt = Date.now();

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set on the server." });
    }

    const { metadata, model } = req.body;
    if (!metadata || !metadata.grid || !metadata.layers || !metadata.layers.blocking) {
      return res.status(400).json({ error: "Missing metadata grid/layers.blocking" });
    }

    const width = metadata?.map?.image_width_px || 1;
    const height = metadata?.map?.image_height_px || 1;
    const normalized = ensureMetadataShape(metadata, metadata.map.image_ref, width, height);

    const draft = await draftBlockingWithOpenAI({ metadata: normalized, model });
    const next = structuredClone(normalized);
    next.layers.ai_blocking = draft.blocking;
    next.ai_annotation = {
      status: "drafted",
      model: draft.apiModel,
      scope: "blocking_only",
      notes: draft.notes,
    };
    next.label_source ||= {};
    next.label_source.updated_at = nowIso();

    const turnaroundMs = Date.now() - startedAt;
    const usage = draft.response.usage || {};

    const logEntry = {
      timestamp: new Date(startedAt).toISOString(),
      endpoint: "/api/draft-blocking",
      imageName: normalized?.map?.image_ref || null,
      model_requested: model || "gpt-4-mini",
      model_used: draft.apiModel,
      turnaround_ms: turnaroundMs,
      input_tokens: usage.input_tokens ?? null,
      output_tokens: usage.output_tokens ?? null,
      total_tokens: usage.total_tokens ?? null,
      blocking_tiles_after_draft: countTrue(next.layers.ai_blocking || []),
      usage_source: "openai_response_usage",
    };

    appendAiLog(logEntry);

    res.json({
      metadata: next,
      draft_log: logEntry,
      prompt_sent: draft.promptSent,
    });
  } catch (err) {
    const turnaroundMs = Date.now() - startedAt;

    appendAiLog({
      timestamp: new Date(startedAt).toISOString(),
      endpoint: "/api/draft-blocking",
      model_requested: req.body?.model || "gpt-4-mini",
      turnaround_ms: turnaroundMs,
      error: err.message,
      usage_source: "openai_error",
    });

    console.error(err);
    res.status(500).json({ error: `Failed to draft blocking metadata: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`Tactical Map Editor running at http://localhost:${PORT}`);
});