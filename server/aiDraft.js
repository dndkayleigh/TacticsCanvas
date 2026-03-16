const fs = require("fs");
const path = require("path");

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

function imageFileToDataUrl(mapDir, imageName) {
  const filePath = path.join(mapDir, imageName);
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

async function draftBlockingWithOpenAI({
  getOpenAIClient,
  mapDir,
  metadata,
  model,
}) {
  const apiModel = mapUiModelToApiModel(model);
  const rows = metadata.grid.rows;
  const cols = metadata.grid.cols;
  const imageDataUrl = imageFileToDataUrl(mapDir, metadata.map.image_ref);

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

  const openai = getOpenAIClient();
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

module.exports = {
  draftBlockingWithOpenAI,
};
