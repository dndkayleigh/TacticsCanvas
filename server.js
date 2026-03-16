const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const OpenAI = require("openai");
const { draftBlockingWithOpenAI } = require("./server/aiDraft");
const {
  appendAiLog,
  buildDraftErrorLogEntry,
  buildDraftSuccessLogEntry,
} = require("./server/aiLog");
const {
  countTrue,
} = require("./server/gridMetrics");
const { ensureMetadataShape, nowIso } = require("./server/metadata");
const {
  buildCaseSummary,
  getNormalizedMetadata,
  getUploadMetadata,
} = require("./server/mapMetadataService");
const {
  imageExists,
  listMapImages,
  saveSidecar,
} = require("./server/sidecars");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const MAP_DIR = path.join(__dirname, "data", "maps");
const LOG_DIR = path.join(__dirname, "data", "logs");
const AI_LOG_PATH = path.join(LOG_DIR, "ai-draft-log.ndjson");

fs.mkdirSync(MAP_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

let openaiClient = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set on the server.");
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return openaiClient;
}

app.use(express.json({ limit: "50mb" }));
app.use(express.static(PUBLIC_DIR));
app.use("/maps", express.static(MAP_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MAP_DIR),
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    app: "tactical-map-editor",
    ai: process.env.OPENAI_API_KEY ? "openai" : "missing_api_key",
  });
});

app.get("/api/maps", (req, res) => {
  try {
    res.json({ maps: listMapImages(MAP_DIR) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list maps." });
  }
});

app.get("/api/case-summary", (req, res) => {
  try {
    const summaries = listMapImages(MAP_DIR).map((imageName) =>
      buildCaseSummary(getNormalizedMetadata(MAP_DIR, imageName), imageName)
    );

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

    const width = Number(req.body.imageWidth || 1200);
    const height = Number(req.body.imageHeight || 800);
    const { metadata, sidecarFound } = getUploadMetadata(MAP_DIR, imageName, width, height);

    if (!sidecarFound) {
      saveSidecar(MAP_DIR, imageName, metadata);
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

    if (!imageExists(MAP_DIR, imageName)) {
      return res.status(404).json({ error: "Image not found." });
    }

    res.json({ metadata: getNormalizedMetadata(MAP_DIR, imageName) });
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

    saveSidecar(MAP_DIR, imageName, metadata);
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

    const draft = await draftBlockingWithOpenAI({
      getOpenAIClient,
      mapDir: MAP_DIR,
      metadata: normalized,
      model,
    });
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

    const usage = draft.response.usage || {};
    const logEntry = buildDraftSuccessLogEntry({
      startedAt,
      imageName: normalized?.map?.image_ref || null,
      modelRequested: model,
      modelUsed: draft.apiModel,
      usage,
      blockingTilesAfterDraft: countTrue(next.layers.ai_blocking || []),
    });

    appendAiLog(AI_LOG_PATH, logEntry);

    res.json({
      metadata: next,
      draft_log: logEntry,
      prompt_sent: draft.promptSent,
    });
  } catch (err) {
    appendAiLog(
      AI_LOG_PATH,
      buildDraftErrorLogEntry({
        startedAt,
        modelRequested: req.body?.model,
        error: err.message,
      })
    );

    console.error(err);
    res.status(500).json({ error: `Failed to draft blocking metadata: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`Tactical Map Editor running at http://localhost:${PORT}`);
});
