const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  imageExists,
  listMapImages,
  loadSidecar,
  saveSidecar,
  sidecarPathForImageName,
} = require("../server/sidecars");
const {
  buildCaseSummary,
  getNormalizedMetadata,
  getUploadMetadata,
} = require("../server/mapMetadataService");

const MAP_DIR = path.join(__dirname, "..", "data", "maps");

test("sidecar helpers save and load metadata using the image-derived sidecar path", () => {
  const imageName = `test-sidecar-${Date.now()}.png`;
  const sidecarPath = sidecarPathForImageName(MAP_DIR, imageName);
  const metadata = {
    map: { image_ref: imageName, image_width_px: 300, image_height_px: 150 },
    grid: { rows: 5, cols: 10 },
    layers: { blocking: [[true]] },
  };

  try {
    saveSidecar(MAP_DIR, imageName, metadata);

    assert.equal(sidecarPath.endsWith(".tactical-map.json"), true);
    assert.deepEqual(loadSidecar(MAP_DIR, imageName), metadata);
  } finally {
    fs.rmSync(sidecarPath, { force: true });
  }
});

test("listMapImages returns only supported image files in sorted order", () => {
  const imageName = `test-listing-${Date.now()}.png`;
  const textName = `test-listing-${Date.now()}.txt`;
  const imagePath = path.join(MAP_DIR, imageName);
  const textPath = path.join(MAP_DIR, textName);

  fs.writeFileSync(imagePath, "image", "utf8");
  fs.writeFileSync(textPath, "not-an-image", "utf8");

  try {
    const images = listMapImages(MAP_DIR);
    assert.equal(images.includes(imageName), true);
    assert.equal(images.includes(textName), false);
    assert.deepEqual([...images].sort((a, b) => a.localeCompare(b)), images);
    assert.equal(imageExists(MAP_DIR, imageName), true);
    assert.equal(imageExists(MAP_DIR, textName), true);
  } finally {
    fs.rmSync(imagePath, { force: true });
    fs.rmSync(textPath, { force: true });
  }
});

test("getNormalizedMetadata creates a default normalized shape when no sidecar exists", () => {
  const imageName = `test-normalized-${Date.now()}.png`;
  const metadata = getNormalizedMetadata(MAP_DIR, imageName, 200, 100);

  assert.equal(metadata.map.image_ref, imageName);
  assert.equal(metadata.grid.rows, 20);
  assert.equal(metadata.grid.cols, 40);
  assert.equal(metadata.layers.blocking.length, 20);
  assert.equal(metadata.layers.blocking[0].length, 40);
});

test("getUploadMetadata reports whether a sidecar already exists", () => {
  const imageName = `test-upload-meta-${Date.now()}.png`;
  const sidecarPath = sidecarPathForImageName(MAP_DIR, imageName);
  const savedMetadata = {
    map: { image_ref: imageName, image_width_px: 320, image_height_px: 160 },
    grid: { rows: 8, cols: 16 },
    layers: { blocking: [[true, false]] },
  };

  try {
    const initial = getUploadMetadata(MAP_DIR, imageName, 320, 160);
    assert.equal(initial.sidecarFound, false);
    assert.equal(initial.metadata.map.image_ref, imageName);

    saveSidecar(MAP_DIR, imageName, savedMetadata);
    const existing = getUploadMetadata(MAP_DIR, imageName, 320, 160);
    assert.equal(existing.sidecarFound, true);
    assert.equal(existing.metadata.map.image_ref, imageName);
    assert.equal(existing.metadata.layers.blocking[0][0], true);
  } finally {
    fs.rmSync(sidecarPath, { force: true });
  }
});

test("buildCaseSummary computes counts from normalized metadata layers", () => {
  const metadata = {
    layers: {
      blocking: [
        [true, false],
        [false, true],
      ],
      ai_blocking: [
        [true, true],
        [false, false],
      ],
      ambiguous: [
        [false, true],
        [false, false],
      ],
    },
    label_source: {
      review_status: "reviewed",
      labeler: "QA",
    },
  };

  const summary = buildCaseSummary(metadata, "example.png");
  assert.deepEqual(summary, {
    imageName: "example.png",
    review_status: "reviewed",
    labeler: "QA",
    human_blocking_count: 2,
    ai_blocking_count: 2,
    agreement_count: 2,
    ai_only_count: 1,
    human_only_count: 1,
    disagreement_count: 2,
    ambiguous_count: 1,
  });
});
