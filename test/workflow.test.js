const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  loadPublishedArtifact,
  listLabelSessions,
  publishLabelSession,
  publishedArtifactPathForImageName,
  sessionStorePathForImageName,
  upsertLabelSession,
} = require("../server/workflowStore");

const WORKFLOW_DIR = path.join(__dirname, "..", "data", "workflow");
const PUBLISHED_DIR = path.join(__dirname, "..", "data", "published");

test("workflow store can create, update, and publish label sessions", () => {
  const imageName = `test-workflow-${Date.now()}.png`;
  const workflowPath = sessionStorePathForImageName(WORKFLOW_DIR, imageName);
  const publishedPath = publishedArtifactPathForImageName(PUBLISHED_DIR, imageName);

  try {
    const first = upsertLabelSession(WORKFLOW_DIR, imageName, {
      session_id: "session-1",
      state: "working",
      labeler: "alice",
      metadata: {
        map: { image_ref: imageName },
        layers: { blocking: [[true]] },
      },
    });

    assert.equal(first.session.session_id, "session-1");
    assert.equal(first.workflow.sessions.length, 1);
    assert.equal(first.workflow.releases.length, 0);

    const second = upsertLabelSession(WORKFLOW_DIR, imageName, {
      session_id: "session-1",
      state: "reviewed",
      labeler: "alice",
      reviewer: "bob",
      metadata: {
        map: { image_ref: imageName },
        layers: { blocking: [[false]] },
      },
    });

    assert.equal(second.workflow.sessions.length, 1);
    assert.equal(second.session.state, "reviewed");
    assert.equal(second.session.reviewer, "bob");

    const published = publishLabelSession({
      workflowDir: WORKFLOW_DIR,
      publishedDir: PUBLISHED_DIR,
      imageName,
      sessionId: "session-1",
      channel: "gold",
    });

    assert.equal(published.workflow.releases.length, 1);
    assert.equal(published.workflow.current_published.channel, "gold");
    assert.equal(published.published.release_version, 1);
    assert.equal(published.published.channel, "gold");
    assert.equal(loadPublishedArtifact(PUBLISHED_DIR, imageName).source_session_id, "session-1");
    assert.equal(listLabelSessions(WORKFLOW_DIR, imageName).sessions.length, 1);
    assert.equal(fs.existsSync(workflowPath), true);
    assert.equal(fs.existsSync(publishedPath), true);
  } finally {
    fs.rmSync(workflowPath, { force: true });
    fs.rmSync(publishedPath, { force: true });
  }
});
