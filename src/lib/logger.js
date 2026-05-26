const fs = require('fs');
const path = require('path');
const { config } = require('../config');

function ensureLogDir() {
  if (!fs.existsSync(config.app.logDir)) {
    fs.mkdirSync(config.app.logDir, { recursive: true });
  }
}

function getLogFilePath() {
  ensureLogDir();
  const stamp = new Date().toISOString().slice(0, 10);
  return path.join(config.app.logDir, `${stamp}.log`);
}

function writeLog(level, message, meta = {}) {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    meta,
  });

  console.log(`[${level.toUpperCase()}] ${message}`);
  fs.appendFileSync(getLogFilePath(), `${line}\n`, 'utf8');
}

module.exports = {
  info(message, meta) {
    writeLog('info', message, meta);
  },
  warn(message, meta) {
    writeLog('warn', message, meta);
  },
  error(message, meta) {
    writeLog('error', message, meta);
  },
};
