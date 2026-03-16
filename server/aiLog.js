const fs = require("fs");

function appendAiLog(aiLogPath, entry) {
  fs.appendFileSync(aiLogPath, JSON.stringify(entry) + "\n", "utf8");
}

function buildDraftSuccessLogEntry({
  startedAt,
  imageName,
  modelRequested,
  modelUsed,
  usage,
  blockingTilesAfterDraft,
}) {
  return {
    timestamp: new Date(startedAt).toISOString(),
    endpoint: "/api/draft-blocking",
    imageName: imageName || null,
    model_requested: modelRequested || "gpt-4-mini",
    model_used: modelUsed,
    turnaround_ms: Date.now() - startedAt,
    input_tokens: usage.input_tokens ?? null,
    output_tokens: usage.output_tokens ?? null,
    total_tokens: usage.total_tokens ?? null,
    blocking_tiles_after_draft: blockingTilesAfterDraft,
    usage_source: "openai_response_usage",
  };
}

function buildDraftErrorLogEntry({ startedAt, modelRequested, error }) {
  return {
    timestamp: new Date(startedAt).toISOString(),
    endpoint: "/api/draft-blocking",
    model_requested: modelRequested || "gpt-4-mini",
    turnaround_ms: Date.now() - startedAt,
    error,
    usage_source: "openai_error",
  };
}

module.exports = {
  appendAiLog,
  buildDraftErrorLogEntry,
  buildDraftSuccessLogEntry,
};
