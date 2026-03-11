// OpenClaw Admin API Server
// Author: wulingshan
// https://github.com/wulingshani/openclaw-docker

const http = require('http');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = '/config/openclaw.json';
const GATEWAY_CONTAINER = process.env.GATEWAY_CONTAINER || 'openclaw-gateway';
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';
const DOCKER_SOCKET = '/var/run/docker.sock';
const PORT = 3456;

// ── Helpers ──

function defaultConfig() {
  const cfg = {
    gateway: {
      mode: 'local',
      bind: 'lan',
      controlUi: {
        allowedOrigins: ['*'],
        allowInsecureAuth: true,
        dangerouslyDisableDeviceAuth: true,
      },
    },
    models: { mode: 'merge', providers: {} },
  };
  if (GATEWAY_TOKEN) {
    cfg.gateway.auth = { mode: 'token', token: GATEWAY_TOKEN };
  }
  return cfg;
}

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    const cfg = defaultConfig();
    writeConfig(cfg);
    return cfg;
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function writeConfig(config) {
  // Pin gateway auth token so it survives restart
  if (GATEWAY_TOKEN) {
    if (!config.gateway) config.gateway = {};
    config.gateway.auth = { mode: 'token', token: GATEWAY_TOKEN };
  }
  const tmp = CONFIG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, CONFIG_PATH);
}

function maskKey(key) {
  if (!key || typeof key !== 'string') return '';
  if (key.startsWith('${')) return '(env variable)';
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

function restartGateway() {
  return new Promise((resolve, reject) => {
    const opts = {
      socketPath: DOCKER_SOCKET,
      path: `/containers/${GATEWAY_CONTAINER}/restart?t=5`,
      method: 'POST',
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode === 204 || res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Docker restart failed: ${res.statusCode} ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function getGatewayStatus() {
  return new Promise((resolve) => {
    const opts = {
      socketPath: DOCKER_SOCKET,
      path: `/containers/${GATEWAY_CONTAINER}/json`,
      method: 'GET',
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          const info = JSON.parse(body);
          resolve({
            status: info.State?.Status || 'unknown',
            health: info.State?.Health?.Status || 'unknown',
            startedAt: info.State?.StartedAt || null,
          });
        } catch {
          resolve({ status: 'unknown', health: 'unknown', startedAt: null });
        }
      });
    });
    req.on('error', () => {
      resolve({ status: 'unreachable', health: 'unknown', startedAt: null });
    });
    req.end();
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

// ── Provider templates ──

const PROVIDER_TEMPLATES = {
  anthropic: { apiKey: '' },
  openai: { apiKey: '' },
  google: { apiKey: '' },
  siliconflow: {
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: '',
    api: 'openai-completions',
    models: [],
  },
};

// ── Routes ──

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  try {
    // GET /api/keys — list providers with masked keys
    if (req.method === 'GET' && pathname === '/api/keys') {
      const config = readConfig();
      const providers = config.models?.providers || {};
      const result = {};
      for (const [name, prov] of Object.entries(providers)) {
        result[name] = { ...prov, apiKey: maskKey(prov.apiKey) };
      }
      const status = await getGatewayStatus();
      return sendJSON(res, 200, { providers: result, gateway: status, templates: PROVIDER_TEMPLATES });
    }

    // POST /api/keys — upsert a provider
    if (req.method === 'POST' && pathname === '/api/keys') {
      const body = await parseBody(req);
      const { provider, config: provConfig } = body;
      if (!provider || typeof provider !== 'string') {
        return sendJSON(res, 400, { error: 'Missing provider name' });
      }
      if (!provConfig || typeof provConfig !== 'object') {
        return sendJSON(res, 400, { error: 'Missing config object' });
      }

      const config = readConfig();
      if (!config.models) config.models = { mode: 'merge', providers: {} };
      if (!config.models.providers) config.models.providers = {};

      // Merge: if apiKey not provided or empty, keep existing
      const existing = config.models.providers[provider] || {};
      if (!provConfig.apiKey && existing.apiKey) {
        provConfig.apiKey = existing.apiKey;
      }

      config.models.providers[provider] = provConfig;
      writeConfig(config);

      await restartGateway();
      return sendJSON(res, 200, { ok: true, message: `Provider "${provider}" saved. Gateway restarting...` });
    }

    // DELETE /api/keys/:provider
    if (req.method === 'DELETE' && pathname.startsWith('/api/keys/')) {
      const provider = decodeURIComponent(pathname.slice('/api/keys/'.length));
      if (!provider) {
        return sendJSON(res, 400, { error: 'Missing provider name' });
      }

      const config = readConfig();
      if (!config.models?.providers?.[provider]) {
        return sendJSON(res, 404, { error: `Provider "${provider}" not found` });
      }

      delete config.models.providers[provider];
      writeConfig(config);

      await restartGateway();
      return sendJSON(res, 200, { ok: true, message: `Provider "${provider}" deleted. Gateway restarting...` });
    }

    // POST /api/restart
    if (req.method === 'POST' && pathname === '/api/restart') {
      await restartGateway();
      return sendJSON(res, 200, { ok: true, message: 'Gateway restarting...' });
    }

    // GET /healthz — for docker healthcheck
    if (req.method === 'GET' && pathname === '/healthz') {
      return sendJSON(res, 200, { ok: true });
    }

    // GET /api/status
    if (req.method === 'GET' && pathname === '/api/status') {
      const status = await getGatewayStatus();
      return sendJSON(res, 200, { gateway: status });
    }

    sendJSON(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('Error:', err.message);
    sendJSON(res, 500, { error: err.message });
  }
}

// ── Start ──

// Ensure config exists before gateway starts (gateway depends_on this service)
readConfig();
console.log(`Config ready: ${CONFIG_PATH}`);

const server = http.createServer(handleRequest);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Admin API listening on :${PORT}`);
});
