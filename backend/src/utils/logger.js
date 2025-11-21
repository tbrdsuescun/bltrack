function format(data) {
  if (typeof data === 'string') return data;
  try { return JSON.stringify(data); } catch { return String(data); }
}

function withLevel(level, args) {
  const ts = new Date().toISOString();
  const msg = args.length === 1 ? args[0] : args;
  const line = `[${ts}] ${level.toUpperCase()}: ${format(msg)}`;
  return line;
}

const logger = {
  // info: (...args) => console.log(withLevel('info', args.length === 1 ? args[0] : args)),
  // error: (...args) => console.error(withLevel('error', args.length === 1 ? args[0] : args)),
  // warn: (...args) => console.warn(withLevel('warn', args.length === 1 ? args[0] : args)),
  // debug: (...args) => console.debug(withLevel('debug', args.length === 1 ? args[0] : args)),
};

module.exports = { logger };