const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const EXPORT_DIR = path.join(DATA_DIR, "exports");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(EXPORT_DIR, { recursive: true });

app.use(express.json({ limit: "20mb" }));
app.use(express.static(PUBLIC_DIR));

function validateMetadata(metadata) {
  const errors = [];

  if (!metadata || typeof metadata !== "object") {
    return ["Metadata must be a JSON object."];
  }

  if (metadata.schema_version !== "0.1.0") {
    errors.push("schema_version must equal 0.1.0");
  }

  if (!metadata.map || typeof metadata.map !== "object") {
    errors.push("map is required");
  }

  if (!metadata.grid || typeof metadata.grid !== "object") {
    errors.push("grid is required");
  }

  if (!metadata.layers || typeof metadata.layers !== "object") {
    errors.push("layers is required");
  }

  if (!metadata.layers?.terrain || !Array.isArray(metadata.layers.terrain)) {
    errors.push("layers.terrain must be a 2D array");
  }

  if (!Array.isArray(metadata.edges)) {
    errors.push("edges must be an array");
  }

  if (!Array.isArray(metadata.objects)) {
    errors.push("objects must be an array");
  }

  const rows = metadata.grid?.dimensions_tiles?.rows;
  const cols = metadata.grid?.dimensions_tiles?.cols;

  if (!Number.isInteger(rows) || rows < 1) {
    errors.push("grid.dimensions_tiles.rows must be a positive integer");
  }

  if (!Number.isInteger(cols) || cols < 1) {
    errors.push("grid.dimensions_tiles.cols must be a positive integer");
  }

  if (Array.isArray(metadata.layers?.terrain) && Number.isInteger(rows) && Number.isInteger(cols)) {
    if (metadata.layers.terrain.length !== rows) {
      errors.push(`terrain row count ${metadata.layers.terrain.length} does not match rows ${rows}`);
    }

    metadata.layers.terrain.forEach((row, r) => {
      if (!Array.isArray(row) || row.length !== cols) {
        errors.push(`terrain row ${r} must contain ${cols} columns`);
      }
    });
  }

  const validCell = (cell) => {
    return Number.isInteger(cell?.r) && Number.isInteger(cell?.c) && cell.r >= 0 && cell.c >= 0 && cell.r < rows && cell.c < cols;
  };

  const adjacent = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

  (metadata.edges || []).forEach((edge, i) => {
    if (!validCell(edge.a) || !validCell(edge.b)) {
      errors.push(`edge ${i} references an out-of-bounds cell`);
      return;
    }
    if (!adjacent(edge.a, edge.b)) {
      errors.push(`edge ${i} must connect orthogonally adjacent cells`);
    }
  });

  const ids = new Set();
  (metadata.objects || []).forEach((obj, i) => {
    if (!obj.id) {
      errors.push(`object ${i} is missing id`);
    } else if (ids.has(obj.id)) {
      errors.push(`duplicate object id: ${obj.id}`);
    } else {
      ids.add(obj.id);
    }

    if (!validCell(obj.anchor)) {
      errors.push(`object ${obj.id || i} has an invalid anchor`);
    }

    if (!Array.isArray(obj.footprint) || obj.footprint.length === 0) {
      errors.push(`object ${obj.id || i} must have a non-empty footprint`);
    }
  });

  return errors;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/validate", (req, res) => {
  const metadata = req.body;
  const errors = validateMetadata(metadata);
  res.json({ valid: errors.length === 0, errors });
});

app.post("/api/export", (req, res) => {
  const metadata = req.body;
  const errors = validateMetadata(metadata);

  if (errors.length > 0) {
    return res.status(400).json({ ok: false, errors });
  }

  const baseName = (metadata?.map?.name || metadata?.map?.id || "map")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_");

  const fileName = `${baseName}.tactical-map.json`;
  const outPath = path.join(EXPORT_DIR, fileName);
  fs.writeFileSync(outPath, JSON.stringify(metadata, null, 2), "utf8");

  res.json({ ok: true, fileName, path: outPath });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Tactical Map Editor running at http://localhost:${PORT}`);
});