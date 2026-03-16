const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { app } = require("../server");
const { sidecarPathForImageName } = require("../server/sidecars");

const MAP_DIR = path.join(__dirname, "..", "data", "maps");

async function withServer(run) {
  const server = await new Promise((resolve) => {
    const nextServer = app.listen(0, () => resolve(nextServer));
  });

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test("GET /health reports app status without requiring an API key", async () => {
  delete process.env.OPENAI_API_KEY;

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.app, "tactical-map-editor");
    assert.equal(body.ai, "missing_api_key");
  });
});

test("GET /api/maps returns the sample map list", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/maps`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(body.maps, [
      "crumbling-gate-nogrid.png",
      "index-card-dungeon-ii-map-7-nogrid.png",
      "webp.webp",
    ]);
  });
});

test("GET /api/case-summary returns summary rows for the sample dataset", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/case-summary`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(Array.isArray(body.cases), true);
    assert.equal(body.cases.length, 3);
    assert.deepEqual(
      body.cases.map((entry) => entry.imageName),
      [
        "crumbling-gate-nogrid.png",
        "index-card-dungeon-ii-map-7-nogrid.png",
        "webp.webp",
      ]
    );
  });
});

test("metadata can be saved and loaded back for a map", async () => {
  const imageName = `test-roundtrip-${Date.now()}.png`;
  const imagePath = path.join(MAP_DIR, imageName);
  const sidecarPath = sidecarPathForImageName(MAP_DIR, imageName);

  fs.writeFileSync(imagePath, "test-image", "utf8");

  try {
    await withServer(async (baseUrl) => {
      const metadata = {
        map: {
          image_ref: imageName,
          image_width_px: 200,
          image_height_px: 100,
        },
        grid: {
          rows: 10,
          cols: 10,
        },
        layers: {
          blocking: [[true, false]],
        },
        label_source: {
          labeler: "tester",
        },
      };

      const saveResponse = await fetch(`${baseUrl}/api/metadata/${imageName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata }),
      });
      assert.equal(saveResponse.status, 200);

      const loadResponse = await fetch(`${baseUrl}/api/metadata/${imageName}`);
      assert.equal(loadResponse.status, 200);

      const body = await loadResponse.json();
      assert.equal(body.metadata.map.image_ref, imageName);
      assert.equal(body.metadata.label_source.labeler, "tester");
      assert.equal(body.metadata.layers.blocking[0][0], true);
      assert.equal(body.metadata.layers.blocking[0][1], false);
      assert.equal(body.metadata.grid.rows, 5);
      assert.equal(body.metadata.grid.cols, 10);
    });
  } finally {
    fs.rmSync(imagePath, { force: true });
    fs.rmSync(sidecarPath, { force: true });
  }
});

test("POST /api/draft-blocking returns a graceful error when no API key is configured", async () => {
  delete process.env.OPENAI_API_KEY;

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/draft-blocking`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: {
          map: {
            image_ref: "webp.webp",
            image_width_px: 436,
            image_height_px: 436,
          },
          grid: {
            rows: 40,
            cols: 40,
          },
          layers: {
            blocking: [],
          },
        },
        model: "gpt-4-mini",
      }),
    });

    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error, "OPENAI_API_KEY is not set on the server.");
  });
});

test("POST /api/upload-map creates a sidecar for a newly uploaded map", async () => {
  const imageName = `test-upload-${Date.now()}.png`;
  const imagePath = path.join(MAP_DIR, imageName);
  const sidecarPath = sidecarPathForImageName(MAP_DIR, imageName);

  try {
    await withServer(async (baseUrl) => {
      const form = new FormData();
      form.set("mapImage", new Blob(["fake-png-bytes"], { type: "image/png" }), imageName);
      form.set("imageWidth", "320");
      form.set("imageHeight", "160");

      const response = await fetch(`${baseUrl}/api/upload-map`, {
        method: "POST",
        body: form,
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.imageName, imageName);
      assert.equal(body.sidecarFound, false);
      assert.equal(body.metadata.map.image_ref, imageName);
      assert.equal(body.metadata.map.image_width_px, 320);
      assert.equal(body.metadata.map.image_height_px, 160);
      assert.equal(body.metadata.grid.rows, 20);
      assert.equal(body.metadata.grid.cols, 40);
      assert.equal(fs.existsSync(imagePath), true);
      assert.equal(fs.existsSync(sidecarPath), true);
    });
  } finally {
    fs.rmSync(imagePath, { force: true });
    fs.rmSync(sidecarPath, { force: true });
  }
});
