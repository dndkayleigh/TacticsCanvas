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

function countBlockingTiles(metadata) {
  const grid = metadata?.layers?.blocking || [];
  let total = 0;
  for (const row of grid) {
    for (const cell of row || []) {
      if (cell) total += 1;
    }
  }
  return total;
}

function sidecarPathForImageName(imageName) {
  const ext = path.extname(imageName);
  const base = path.basename(imageName, ext);
  return path.join(MAP_DIR, `${base}.tactical-map.json`);
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

function buildBlankMetadata({ imageName, width, height }) {
  const grid = computeDefaultGridForImage(width, height);
  const tileSize = computeTileSizeFromGrid(width, height, grid.rows, grid.cols);

  return {
    schema_version: "0.1.0",
    purpose: "tactical_map_metadata",
    map: {
      name: imageName,
      image_ref: imageName,
      image_width_px: width,
      image_height_px: height,
    },
    grid: {
      type: "square",
      origin: "bottom_left",
      tile_size_px: tileSize,
      rows: grid.rows,
      cols: grid.cols,
    },
    layers: {
      blocking: Array.from({ length: grid.rows }, () =>
        Array.from({ length: grid.cols }, () => false)
      ),
    },
    ai_annotation: {
      status: "none",
      model: null,
      scope: "blocking_only",
      notes: [],
    },
  };
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
      "true means the tile is occupied by a clearly impassable wall or barrier.",
      "false means the tile is traversable or uncertain.",
      "Be conservative. Prefer false unless there is clear visual evidence of an impassable barrier.",
      "Do not infer extra wall tiles beyond the visible barrier footprint.",
      "Do not mark furniture, clutter, shadows, labels, or decorative art as blocking.",
      "Do not fill room interiors; only mark the barrier tiles themselves.",
      "Use the exact bottom-left row indexing convention."
    ],
  };

  const response = await openai.responses.create({
    model: apiModel,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: systemPrompt,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify(userPayload),
          },
          {
            type: "input_image",
            image_url: imageDataUrl,
            detail: "high",
          },
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
      if (metadata?.grid) {
        const bounded = enforceAspectBoundedGrid(
          metadata.grid.rows || 1,
          metadata.grid.cols || 1,
          width,
          height
        );
        metadata.grid.rows = bounded.rows;
        metadata.grid.cols = bounded.cols;
        metadata.grid.tile_size_px = computeTileSizeFromGrid(
          width,
          height,
          bounded.rows,
          bounded.cols
        );
      }
      sidecarFound = true;
    } else {
      metadata = buildBlankMetadata({ imageName, width, height });
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
    const sidecarPath = sidecarPathForImageName(imageName);
    if (!fs.existsSync(sidecarPath)) {
      return res.status(404).json({ error: "Metadata not found." });
    }

    const metadata = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
    if (metadata?.grid && metadata?.map) {
      const width = metadata.map.image_width_px || 1;
      const height = metadata.map.image_height_px || 1;
      const bounded = enforceAspectBoundedGrid(
        metadata.grid.rows || 1,
        metadata.grid.cols || 1,
        width,
        height
      );
      metadata.grid.rows = bounded.rows;
      metadata.grid.cols = bounded.cols;
      metadata.grid.tile_size_px = computeTileSizeFromGrid(
        width,
        height,
        bounded.rows,
        bounded.cols
      );
    }

    res.json({ metadata });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load metadata." });
  }
});

app.post("/api/metadata/:imageName", (req, res) => {
  try {
    const imageName = req.params.imageName;
    const metadata = req.body.metadata;
    if (!metadata) return res.status(400).json({ error: "Missing metadata." });

    if (metadata?.grid && metadata?.map) {
      const width = metadata.map.image_width_px || 1;
      const height = metadata.map.image_height_px || 1;
      const bounded = enforceAspectBoundedGrid(
        metadata.grid.rows || 1,
        metadata.grid.cols || 1,
        width,
        height
      );
      metadata.grid.rows = bounded.rows;
      metadata.grid.cols = bounded.cols;
      metadata.grid.tile_size_px = computeTileSizeFromGrid(
        width,
        height,
        bounded.rows,
        bounded.cols
      );
    }

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
    const bounded = enforceAspectBoundedGrid(
      metadata.grid.rows || 1,
      metadata.grid.cols || 1,
      width,
      height
    );
    metadata.grid.rows = bounded.rows;
    metadata.grid.cols = bounded.cols;
    metadata.grid.tile_size_px = computeTileSizeFromGrid(
      width,
      height,
      bounded.rows,
      bounded.cols
    );

    const draft = await draftBlockingWithOpenAI({ metadata, model });
    const next = structuredClone(metadata);
    next.layers.blocking = draft.blocking;
    next.ai_annotation = {
      status: "drafted",
      model: draft.apiModel,
      scope: "blocking_only",
      notes: draft.notes,
    };

    const turnaroundMs = Date.now() - startedAt;
    const usage = draft.response.usage || {};

    const logEntry = {
      timestamp: new Date(startedAt).toISOString(),
      endpoint: "/api/draft-blocking",
      imageName: metadata?.map?.image_ref || null,
      model_requested: model || "gpt-4-mini",
      model_used: draft.apiModel,
      turnaround_ms: turnaroundMs,
      input_tokens: usage.input_tokens ?? null,
      output_tokens: usage.output_tokens ?? null,
      total_tokens: usage.total_tokens ?? null,
      blocking_tiles_after_draft: countBlockingTiles(next),
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