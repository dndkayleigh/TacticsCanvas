const fs = require("fs");
const path = require("path");

const ALLOWED_SESSION_STATES = new Set(["ai_draft", "working", "reviewed", "gold"]);

function nowIso() {
  return new Date().toISOString();
}

function sessionStorePathForImageName(workflowDir, imageName) {
  const ext = path.extname(imageName);
  const base = path.basename(imageName, ext);
  return path.join(workflowDir, `${base}.label-sessions.json`);
}

function publishedArtifactPathForImageName(publishedDir, imageName) {
  const ext = path.extname(imageName);
  const base = path.basename(imageName, ext);
  return path.join(publishedDir, `${base}.published.tactical-map.json`);
}

function normalizeSessionState(state) {
  return ALLOWED_SESSION_STATES.has(state) ? state : "working";
}

function createEmptyWorkflowState(imageName) {
  return {
    image_name: imageName,
    sessions: [],
    releases: [],
    current_published: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

function loadWorkflowState(workflowDir, imageName) {
  const storePath = sessionStorePathForImageName(workflowDir, imageName);

  if (!fs.existsSync(storePath)) {
    return createEmptyWorkflowState(imageName);
  }

  const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
  return {
    image_name: parsed.image_name || imageName,
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    releases: Array.isArray(parsed.releases) ? parsed.releases : [],
    current_published: parsed.current_published || null,
    created_at: parsed.created_at || nowIso(),
    updated_at: parsed.updated_at || nowIso(),
  };
}

function saveWorkflowState(workflowDir, imageName, workflowState) {
  const storePath = sessionStorePathForImageName(workflowDir, imageName);
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  const next = {
    ...workflowState,
    image_name: imageName,
    updated_at: nowIso(),
  };
  fs.writeFileSync(storePath, JSON.stringify(next, null, 2), "utf8");
  return next;
}

function listLabelSessions(workflowDir, imageName) {
  return loadWorkflowState(workflowDir, imageName);
}

function upsertLabelSession(workflowDir, imageName, sessionInput) {
  const workflowState = loadWorkflowState(workflowDir, imageName);
  const sessionId =
    sessionInput?.session_id ||
    `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const existing = workflowState.sessions.find((session) => session.session_id === sessionId);
  const timestamp = nowIso();

  const nextSession = {
    session_id: sessionId,
    state: normalizeSessionState(sessionInput?.state),
    labeler: sessionInput?.labeler || "",
    reviewer: sessionInput?.reviewer ?? null,
    source: sessionInput?.source || "human",
    parent_session_id: sessionInput?.parent_session_id || null,
    notes: Array.isArray(sessionInput?.notes) ? sessionInput.notes : [],
    metadata: sessionInput?.metadata || {},
    created_at: existing?.created_at || timestamp,
    updated_at: timestamp,
  };

  workflowState.sessions = workflowState.sessions.filter(
    (session) => session.session_id !== sessionId
  );
  workflowState.sessions.push(nextSession);

  return {
    workflow: saveWorkflowState(workflowDir, imageName, workflowState),
    session: nextSession,
  };
}

function publishLabelSession({ workflowDir, publishedDir, imageName, sessionId, channel }) {
  const workflowState = loadWorkflowState(workflowDir, imageName);
  const session = workflowState.sessions.find((entry) => entry.session_id === sessionId);

  if (!session) {
    throw new Error(`Unknown session_id: ${sessionId}`);
  }

  const releaseVersion =
    workflowState.releases.reduce(
      (highest, release) => Math.max(highest, Number(release.release_version) || 0),
      0
    ) + 1;
  const publishedAt = nowIso();
  const artifactPath = publishedArtifactPathForImageName(publishedDir, imageName);
  const publishedRecord = {
    image_name: imageName,
    release_version: releaseVersion,
    channel: channel || session.state,
    source_session_id: session.session_id,
    source_state: session.state,
    published_at: publishedAt,
    metadata: session.metadata,
  };

  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, JSON.stringify(publishedRecord, null, 2), "utf8");

  const releaseHistoryEntry = {
    release_version: releaseVersion,
    channel: publishedRecord.channel,
    source_session_id: session.session_id,
    source_state: session.state,
    published_at: publishedAt,
  };

  workflowState.releases.push(releaseHistoryEntry);
  workflowState.current_published = releaseHistoryEntry;

  return {
    workflow: saveWorkflowState(workflowDir, imageName, workflowState),
    published: publishedRecord,
  };
}

function loadPublishedArtifact(publishedDir, imageName) {
  const artifactPath = publishedArtifactPathForImageName(publishedDir, imageName);
  if (!fs.existsSync(artifactPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

module.exports = {
  loadPublishedArtifact,
  listLabelSessions,
  loadWorkflowState,
  publishLabelSession,
  publishedArtifactPathForImageName,
  saveWorkflowState,
  sessionStorePathForImageName,
  upsertLabelSession,
};
