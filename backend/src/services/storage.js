const fs = require('fs');
const path = require('path');
const { STORAGE_PATH } = require('../config');

function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_PATH)) {
    fs.mkdirSync(STORAGE_PATH, { recursive: true });
  }
}

function filePath(filename) {
  return path.join(STORAGE_PATH, filename);
}

function deleteFileSafe(fileAbsPath) {
  try {
    fs.unlinkSync(fileAbsPath);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { ensureStorageDir, filePath, deleteFileSafe };