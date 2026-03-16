const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeDefaultGridForImage,
  deriveTileBlockingFromEdgeLayer,
  ensureMetadataShape,
  migrateTileBlockingToEdgeLayer,
} = require("../server/metadata");

test("computeDefaultGridForImage keeps wide maps within 40 columns", () => {
  const grid = computeDefaultGridForImage(1200, 600);
  assert.deepEqual(grid, { rows: 20, cols: 40 });
});

test("ensureMetadataShape normalizes missing fields and grid layers", () => {
  const metadata = ensureMetadataShape(
    {
      grid: { rows: 3, cols: 99 },
      layers: {
        blocking: [[1, 0], [false, true]],
      },
    },
    "example.png",
    100,
    50
  );

  assert.equal(metadata.schema_version, "0.1.0");
  assert.equal(metadata.purpose, "tactical_map_metadata");
  assert.equal(metadata.map.image_ref, "example.png");
  assert.deepEqual(metadata.grid, {
    type: "square",
    origin: "bottom_left",
    tile_size_px: 3,
    rows: 20,
    cols: 40,
  });
  assert.equal(metadata.layers.blocking.length, 20);
  assert.equal(metadata.layers.blocking[0].length, 40);
  assert.equal(metadata.layers.blocking[0][0], true);
  assert.equal(metadata.layers.blocking[0][1], false);
  assert.equal(metadata.layers.ai_blocking[0][0], false);
  assert.equal(metadata.layers.ambiguous[0][0], false);
  assert.equal(metadata.tactical.boundary_layers.blocking.horizontal.length, 21);
  assert.equal(metadata.tactical.boundary_layers.blocking.vertical.length, 20);
  assert.equal(metadata.ai_annotation.status, "none");
  assert.equal(metadata.label_source.review_status, "in_progress");
  assert.equal(metadata.case_metadata.notes, "");
});

test("migrateTileBlockingToEdgeLayer marks only region boundaries", () => {
  const layer = migrateTileBlockingToEdgeLayer(
    [
      [true, true],
      [false, true],
    ],
    2,
    2
  );

  assert.deepEqual(layer.horizontal, [
    [true, true],
    [true, false],
    [false, true],
  ]);
  assert.deepEqual(layer.vertical, [
    [true, false, true],
    [false, true, true],
  ]);
});

test("deriveTileBlockingFromEdgeLayer reconstructs enclosed blocked regions", () => {
  const blocking = [
    [true, true, false],
    [true, true, false],
    [false, false, false],
  ];
  const edgeLayer = migrateTileBlockingToEdgeLayer(blocking, 3, 3);

  assert.deepEqual(deriveTileBlockingFromEdgeLayer(edgeLayer, 3, 3), blocking);
});
