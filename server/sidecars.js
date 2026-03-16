const fs = require("fs");
const path = require("path");

function sidecarPathForImageName(mapDir, imageName) {
  const ext = path.extname(imageName);
  const base = path.basename(imageName, ext);
  return path.join(mapDir, `${base}.tactical-map.json`);
}

function listMapImages(mapDir) {
  return fs
    .readdirSync(mapDir)
    .filter((name) => /\.(png|jpg|jpeg|webp|gif)$/i.test(name))
    .sort((a, b) => a.localeCompare(b));
}

function loadSidecar(mapDir, imageName) {
  const sidecarPath = sidecarPathForImageName(mapDir, imageName);
  if (!fs.existsSync(sidecarPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
}

function saveSidecar(mapDir, imageName, metadata) {
  const sidecarPath = sidecarPathForImageName(mapDir, imageName);
  fs.writeFileSync(sidecarPath, JSON.stringify(metadata, null, 2), "utf8");
  return sidecarPath;
}

function imageExists(mapDir, imageName) {
  return fs.existsSync(path.join(mapDir, imageName));
}

module.exports = {
  imageExists,
  listMapImages,
  loadSidecar,
  saveSidecar,
  sidecarPathForImageName,
};
