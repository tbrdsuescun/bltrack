const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '..', '..', 'error.log');

function format(data) {
  if (typeof data === 'string') return data;
  try { return JSON.stringify(data); } catch { return String(data); }
}

function withLevel(level, args) {
  const ts = new Date().toISOString();
  const msg = args.length === 1 ? args[0] : args;
  const line = `[${ts}] ${level.toUpperCase()}: ${format(msg)}\n`;
  
  // Write ALL logs to file for debugging purposes
  try {
    fs.appendFileSync(logFile, line);
  } catch (e) {
    console.error('Error escribiendo en log:', e);
  }
  
  return line.trim();
}

const logger = {
  info: (...args) => console.log(withLevel('info', args)),
  error: (...args) => console.error(withLevel('error', args)),
  warn: (...args) => console.warn(withLevel('warn', args)),
  debug: (...args) => console.debug(withLevel('debug', args)),
};

module.exports = { logger };