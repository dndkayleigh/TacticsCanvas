const test = require("node:test");
const assert = require("node:assert/strict");

const { ensureMetadataShape } = require("../server/metadata");
const {
  normalizeMapMetadata,
  serializeMapMetadata,
  makeGrid,
  deriveTileBlockingFromEdgeLayer,
  migrateTileBlockingToEdgeLayer,
} = require("../public/mapMetadata");

test("ensureMetadataShape preserves legacy layer data while normalizing dimensions", () => {
  const metadata = ensureMetadataShape(
    {
      schema_version: "0.1.0",
      layers: {
        blocking: [[1, 0], [0, 1]],
        ai_blocking: [[0, 1], [1, 0]],
        ambiguous: [[0, 0], [1, 0]],
      },
      ai_annotation: {
        status: "drafted",
        model: "gpt-4.1-mini",
        scope: "blocking_only",
        notes: ["legacy note"],
      },
      label_source: {
        status: "human_gold",
        labeler: "legacy-user",
        review_status: "reviewed",
        reviewer: "qa-user",
        blocking_rule_version: "v0",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      },
      case_metadata: {
        notes: "legacy case note",
      },
    },
    "legacy-map.png",
    100,
    100
  );

  assert.equal(metadata.map.image_ref, "legacy-map.png");
  assert.equal(metadata.grid.rows, 2);
  assert.equal(metadata.grid.cols, 2);
  assert.deepEqual(metadata.layers.blocking, [
    [true, false],
    [false, true],
  ]);
  assert.deepEqual(metadata.layers.ai_blocking, [
    [false, true],
    [true, false],
  ]);
  assert.deepEqual(metadata.layers.ambiguous, [
    [false, false],
    [true, false],
  ]);
  assert.equal(metadata.ai_annotation.model, "gpt-4.1-mini");
  assert.equal(metadata.label_source.labeler, "legacy-user");
  assert.equal(metadata.label_source.reviewer, "qa-user");
  assert.equal(metadata.label_source.created_at, "2026-01-01T00:00:00.000Z");
  assert.equal(metadata.case_metadata.notes, "legacy case note");
  assert.deepEqual(metadata.tactical.boundary_layers.blocking.horizontal, [
    [true, false],
    [true, true],
    [false, true],
  ]);
  assert.deepEqual(metadata.tactical.boundary_layers.blocking.vertical, [
    [true, true, false],
    [false, true, true],
  ]);
});

test("normalizeMapMetadata lifts legacy review and AI fields into the shared normalized shape", () => {
  const normalized = normalizeMapMetadata(
    {
      schema_version: "0.1.0",
      map: {
        name: "Legacy Map",
        image_ref: "legacy-map.png",
        image_width_px: 256,
        image_height_px: 128,
      },
      grid: {
        rows: 2,
        cols: 4,
        tile_size_px: 32,
      },
      layers: {
        blocking: [
          [true, false, false, true],
          [false, true, false, false],
        ],
        ai_blocking: makeGrid(2, 4, true),
        ambiguous: [
          [false, false, true, false],
          [false, false, false, false],
        ],
      },
      ai_annotation: {
        status: "drafted",
        model: "gpt-4.1-mini",
        scope: "blocking_only",
        notes: ["legacy ai note"],
      },
      label_source: {
        status: "human_gold",
        labeler: "legacy-user",
        review_status: "reviewed",
        reviewer: "qa-user",
        blocking_rule_version: "v1",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      },
      case_metadata: {
        notes: "legacy note",
      },
    },
    {
      imageName: "legacy-map.png",
      imageWidth: 256,
      imageHeight: 128,
    }
  );

  assert.equal(normalized.schemaVersion, "1.0.0");
  assert.equal(normalized.map.imageRef, "legacy-map.png");
  assert.equal(normalized.grid.rows, 2);
  assert.equal(normalized.grid.cols, 4);
  assert.equal(normalized.annotation.ai.status, "drafted");
  assert.equal(normalized.annotation.ai.model, "gpt-4.1-mini");
  assert.equal(normalized.annotation.review.labelSource, "human_gold");
  assert.equal(normalized.annotation.review.labeler, "legacy-user");
  assert.equal(normalized.annotation.review.reviewStatus, "reviewed");
  assert.equal(normalized.annotation.review.notes, "legacy note");
  assert.deepEqual(normalized.layers.blocking, [
    [true, false, false, true],
    [false, true, false, false],
  ]);
  assert.deepEqual(
    normalized.tactical.boundaryLayers.blocking.horizontal,
    migrateTileBlockingToEdgeLayer(normalized.layers.blocking, 2, 4).horizontal
  );
  assert.deepEqual(
    normalized.tactical.boundaryLayers.blocking.vertical,
    migrateTileBlockingToEdgeLayer(normalized.layers.blocking, 2, 4).vertical
  );
  assert.deepEqual(normalized.extensions.tacticsCanvas.ai_blocking, makeGrid(2, 4, true));
  assert.deepEqual(normalized.extensions.tacticsCanvas.ambiguous, [
    [false, false, true, false],
    [false, false, false, false],
  ]);
});

test("serializeMapMetadata preserves normalized review fields and namespaced extensions", () => {
  const serialized = serializeMapMetadata({
    map: {
      id: "legacy-map",
      name: "Legacy Map",
      imageRef: "legacy-map.png",
      imageWidthPx: 256,
      imageHeightPx: 128,
    },
    grid: {
      type: "square",
      origin: "bottom_left",
      rows: 2,
      cols: 4,
      tileSizePx: 32,
    },
    calibration: {
      mapOffsetPx: { x: 1, y: 2 },
      mapScale: 1,
      mapRotationDeg: 0,
      mapOpacity: 0.9,
    },
    layers: {
      blocking: [
        [true, false, false, true],
        [false, true, false, false],
      ],
    },
    annotation: {
      ai: {
        status: "drafted",
        model: "gpt-4.1-mini",
        scope: "blocking_only",
        notes: ["note"],
      },
      review: {
        labelSource: "human_gold",
        labeler: "tester",
        reviewStatus: "reviewed",
        reviewer: "qa",
        blockingRuleVersion: "v1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        notes: "review note",
      },
    },
    extensions: {
      tacticsCanvas: {
        ai_blocking: makeGrid(2, 4, false),
        ambiguous: makeGrid(2, 4, false),
      },
      customConsumer: {
        foo: "bar",
      },
    },
  });

  assert.equal(serialized.schema_version, "1.0.0");
  assert.equal(serialized.map.image_ref, "legacy-map.png");
  assert.equal(serialized.annotation.review.label_source, "human_gold");
  assert.equal(serialized.annotation.review.labeler, "tester");
  assert.equal(serialized.annotation.review.notes, "review note");
  assert.equal(serialized.calibration.map_opacity, 0.9);
  assert.deepEqual(
    serialized.tactical.boundary_layers.blocking.horizontal,
    migrateTileBlockingToEdgeLayer(
      [
        [true, false, false, true],
        [false, true, false, false],
      ],
      2,
      4
    ).horizontal
  );
  assert.deepEqual(serialized.extensions.customConsumer, { foo: "bar" });
  assert.deepEqual(serialized.layers.blocking, [
    [true, false, false, true],
    [false, true, false, false],
  ]);
});

test("normalizeMapMetadata derives legacy compatibility tiles from canonical edge blocking", () => {
  const edgeLayer = migrateTileBlockingToEdgeLayer(
    [
      [true, true, false],
      [true, true, false],
      [false, false, false],
    ],
    3,
    3
  );

  const normalized = normalizeMapMetadata(
    {
      schema_version: "1.0.0",
      map: {
        image_ref: "edge-map.png",
        image_width_px: 300,
        image_height_px: 300,
      },
      grid: {
        rows: 3,
        cols: 3,
        tile_size_px: 100,
      },
      layers: {
        blocking: makeGrid(3, 3, false),
      },
      tactical: {
        boundary_layers: {
          blocking: edgeLayer,
        },
      },
    },
    {
      imageName: "edge-map.png",
      imageWidth: 300,
      imageHeight: 300,
    }
  );

  assert.deepEqual(
    normalized.layers.blocking,
    deriveTileBlockingFromEdgeLayer(edgeLayer, 3, 3)
  );
});
