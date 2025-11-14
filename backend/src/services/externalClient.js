const axios = require('axios');
const { EXTERNAL_TIMEOUT_MS } = require('../config');

async function getWithRetry(url, retries) {
  let attempt = 0;
  let lastErr;
  while (attempt <= retries) {
    try {
      const res = await axios.get(url, { timeout: EXTERNAL_TIMEOUT_MS });
      return res.data;
    } catch (err) {
      lastErr = err;
      attempt++;
      if (attempt > retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastErr;
}

async function postWithRetry(url, data, retries) {
  let attempt = 0;
  let lastErr;
  while (attempt <= retries) {
    try {
      const res = await axios.post(url, data, { timeout: EXTERNAL_TIMEOUT_MS });
      return res.data;
    } catch (err) {
      lastErr = err;
      attempt++;
      if (attempt > retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastErr;
}

module.exports = { getWithRetry, postWithRetry };