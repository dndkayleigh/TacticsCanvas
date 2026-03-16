const { countAgreement, countAiOnly, countHumanOnly, countTrue } = require("./gridMetrics");
const { ensureMetadataShape } = require("./metadata");
const { loadSidecar } = require("./sidecars");

function getNormalizedMetadata(mapDir, imageName, fallbackWidth = 1200, fallbackHeight = 800) {
  const loaded = loadSidecar(mapDir, imageName);

  if (!loaded) {
    return ensureMetadataShape({}, imageName, fallbackWidth, fallbackHeight);
  }

  const width = loaded?.map?.image_width_px || fallbackWidth;
  const height = loaded?.map?.image_height_px || fallbackHeight;
  return ensureMetadataShape(loaded, imageName, width, height);
}

function getUploadMetadata(mapDir, imageName, width, height) {
  const loaded = loadSidecar(mapDir, imageName);

  if (!loaded) {
    return {
      metadata: ensureMetadataShape({}, imageName, width, height),
      sidecarFound: false,
    };
  }

  return {
    metadata: ensureMetadataShape(loaded, imageName, width, height),
    sidecarFound: true,
  };
}

function buildCaseSummary(metadata, imageName) {
  const human = metadata.layers.blocking || [];
  const ai = metadata.layers.ai_blocking || [];
  const ambiguous = metadata.layers.ambiguous || [];

  return {
    imageName,
    review_status: metadata.label_source?.review_status || "in_progress",
    labeler: metadata.label_source?.labeler || "",
    human_blocking_count: countTrue(human),
    ai_blocking_count: countTrue(ai),
    agreement_count: countAgreement(human, ai),
    ai_only_count: countAiOnly(human, ai),
    human_only_count: countHumanOnly(human, ai),
    disagreement_count: countAiOnly(human, ai) + countHumanOnly(human, ai),
    ambiguous_count: countTrue(ambiguous),
  };
}

module.exports = {
  buildCaseSummary,
  getNormalizedMetadata,
  getUploadMetadata,
};
