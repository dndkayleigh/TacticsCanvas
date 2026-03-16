const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { app } = require("../server");
const { migrateTileBlockingToEdgeLayer } = require("../server/metadata");
const { sidecarPathForImageName } = require("../server/sidecars");
const {
  publishedArtifactPathForImageName,
  sessionStorePathForImageName,
} = require("../server/workflowStore");

const MAP_DIR = path.join(__dirname, "..", "data", "maps");
const WORKFLOW_DIR = path.join(__dirname, "..", "data", "workflow");
const PUBLISHED_DIR = path.join(__dirname, "..", "data", "published");

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

test("GET /api/maps returns supported images and includes the core sample maps", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/maps`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(Array.isArray(body.maps), true);
    assert.equal(body.maps.includes("crumbling-gate-nogrid.png"), true);
    assert.equal(body.maps.includes("index-card-dungeon-ii-map-7-nogrid.png"), true);
    assert.equal(body.maps.includes("webp.webp"), true);
  });
});

test("GET /api/case-summary returns summary rows including the core sample dataset", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/case-summary`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(Array.isArray(body.cases), true);
    assert.ok(body.cases.length >= 3);
    const imageNames = body.cases.map((entry) => entry.imageName);
    assert.equal(imageNames.includes("crumbling-gate-nogrid.png"), true);
    assert.equal(imageNames.includes("index-card-dungeon-ii-map-7-nogrid.png"), true);
    assert.equal(imageNames.includes("webp.webp"), true);
  });
});

test("metadata can be saved and loaded back for a map", async () => {
  const imageName = `test-roundtrip-${Date.now()}.png`;
  const imagePath = path.join(MAP_DIR, imageName);
  const sidecarPath = sidecarPathForImageName(MAP_DIR, imageName);
  const workflowPath = sessionStorePathForImageName(WORKFLOW_DIR, imageName);

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
    fs.rmSync(workflowPath, { force: true });
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

test("metadata save/load preserves tactical edge blocking layers", async () => {
  const imageName = `test-edge-roundtrip-${Date.now()}.png`;
  const imagePath = path.join(MAP_DIR, imageName);
  const sidecarPath = sidecarPathForImageName(MAP_DIR, imageName);
  const workflowPath = sessionStorePathForImageName(WORKFLOW_DIR, imageName);
  const expectedBlocking = [
    [true, false],
    [false, true],
  ];
  const expectedEdges = migrateTileBlockingToEdgeLayer(expectedBlocking, 2, 2);

  fs.writeFileSync(imagePath, "test-image", "utf8");

  try {
    await withServer(async (baseUrl) => {
      const metadata = {
        map: {
          image_ref: imageName,
          image_width_px: 200,
          image_height_px: 200,
        },
        grid: {
          rows: 2,
          cols: 2,
        },
        layers: {
          blocking: expectedBlocking,
        },
        tactical: {
          boundary_layers: {
            blocking: expectedEdges,
          },
          cell_layers: {},
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
      assert.deepEqual(body.metadata.layers.blocking, expectedBlocking);
      assert.deepEqual(body.metadata.tactical.boundary_layers.blocking.horizontal, expectedEdges.horizontal);
      assert.deepEqual(body.metadata.tactical.boundary_layers.blocking.vertical, expectedEdges.vertical);
    });
  } finally {
    fs.rmSync(imagePath, { force: true });
    fs.rmSync(sidecarPath, { force: true });
    fs.rmSync(workflowPath, { force: true });
  }
});

test("POST /api/upload-map creates a sidecar for a newly uploaded map", async () => {
  const imageName = `test-upload-${Date.now()}.png`;
  const imagePath = path.join(MAP_DIR, imageName);
  const sidecarPath = sidecarPathForImageName(MAP_DIR, imageName);
  const workflowPath = sessionStorePathForImageName(WORKFLOW_DIR, imageName);

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
    fs.rmSync(workflowPath, { force: true });
  }
});

test("workflow endpoints can save sessions and publish a canonical artifact", async () => {
  const imageName = `test-workflow-api-${Date.now()}.png`;
  const imagePath = path.join(MAP_DIR, imageName);
  const workflowPath = sessionStorePathForImageName(WORKFLOW_DIR, imageName);
  const publishedPath = publishedArtifactPathForImageName(PUBLISHED_DIR, imageName);

  fs.writeFileSync(imagePath, "test-image", "utf8");

  try {
    await withServer(async (baseUrl) => {
      const sessionPayload = {
        session: {
          session_id: "session-1",
          state: "reviewed",
          labeler: "alice",
          reviewer: "bob",
          metadata: {
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
          },
        },
      };

      const saveSessionResponse = await fetch(`${baseUrl}/api/workflow/${imageName}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionPayload),
      });
      assert.equal(saveSessionResponse.status, 200);

      const workflowResponse = await fetch(`${baseUrl}/api/workflow/${imageName}`);
      assert.equal(workflowResponse.status, 200);
      const workflowBody = await workflowResponse.json();
      assert.equal(workflowBody.workflow.sessions.length, 1);
      assert.equal(workflowBody.workflow.sessions[0].state, "reviewed");
      assert.equal(workflowBody.published, null);

      const publishResponse = await fetch(`${baseUrl}/api/workflow/${imageName}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "session-1",
          channel: "gold",
        }),
      });
      assert.equal(publishResponse.status, 200);
      const publishBody = await publishResponse.json();
      assert.equal(publishBody.published.channel, "gold");
      assert.equal(publishBody.published.source_session_id, "session-1");

      const publishedResponse = await fetch(`${baseUrl}/api/published/${imageName}`);
      assert.equal(publishedResponse.status, 200);
      const publishedBody = await publishedResponse.json();
      assert.equal(publishedBody.published.channel, "gold");
      assert.equal(publishedBody.published.release_version, 1);
    });
  } finally {
    fs.rmSync(imagePath, { force: true });
    fs.rmSync(workflowPath, { force: true });
    fs.rmSync(publishedPath, { force: true });
  }
});
