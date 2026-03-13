// OpenClaw Channels API Server — Feishu SDK Long Connection
// Author: wulingshan
// https://github.com/wulingshani/openclaw-docker

const http = require('http');
const https = require('https');
const fs = require('fs');

const CONFIG_PATH = '/config/channels.json';
const OPENCLAW_CONFIG_PATH = '/config/openclaw.json';
const PORT = 3457;

// ── Platform definitions ──

const PLATFORMS = {
  feishu: {
    fields: [
      { key: 'appId', required: true },
      { key: 'appSecret', required: true, secret: true },
    ],
  },
  dingtalk: {
    fields: [
      { key: 'appKey', required: true },
      { key: 'appSecret', required: true, secret: true },
      { key: 'robotCode', required: true },
      { key: 'outgoingToken', secret: true },
    ],
  },
  wechat: {
    fields: [
      { key: 'appId', required: true },
      { key: 'appSecret', required: true, secret: true },
      { key: 'token', required: true, secret: true },
      { key: 'encodingAESKey', secret: true },
    ],
  },
  wework: {
    fields: [
      { key: 'corpId', required: true },
      { key: 'agentId', required: true },
      { key: 'secret', required: true, secret: true },
      { key: 'token', secret: true },
      { key: 'encodingAESKey', secret: true },
    ],
  },
  qq: {
    fields: [
      { key: 'appId', required: true },
      { key: 'token', required: true, secret: true },
      { key: 'appSecret', required: true, secret: true },
      { key: 'sandbox', type: 'boolean' },
    ],
  },
  telegram: {
    fields: [
      { key: 'botToken', required: true, secret: true },
      { key: 'webhookSecret', secret: true },
    ],
  },
  discord: {
    fields: [
      { key: 'botToken', required: true, secret: true },
      { key: 'applicationId', required: true },
      { key: 'publicKey', required: true },
    ],
  },
  slack: {
    fields: [
      { key: 'botToken', required: true, secret: true },
      { key: 'signingSecret', required: true, secret: true },
      { key: 'appToken', secret: true },
    ],
  },
};

// ── In-memory stores ──

const conversations = new Map();
const CONV_MAX_MESSAGES = 20;
const CONV_TTL = 30 * 60 * 1000;

// Active Feishu WSClient instances: channelName -> { wsClient, client }
const feishuClients = new Map();

// Cleanup stale conversations every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, conv] of conversations) {
    if (now - conv.lastActive > CONV_TTL) conversations.delete(key);
  }
}, 60 * 1000);

// ── Config helpers ──

function defaultConfig() {
  return { channels: {} };
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
  const tmp = CONFIG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, CONFIG_PATH);
}

function maskSecret(val) {
  if (!val || typeof val !== 'string') return '';
  if (val.length <= 8) return '****';
  return val.slice(0, 4) + '****' + val.slice(-4);
}

function maskChannelSecrets(channel) {
  const platformDef = PLATFORMS[channel.type];
  if (!platformDef) return channel;
  const masked = { ...channel, config: { ...channel.config } };
  for (const field of platformDef.fields) {
    if (field.secret && masked.config[field.key]) {
      masked.config[field.key] = maskSecret(masked.config[field.key]);
    }
  }
  return masked;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) { req.destroy(); reject(new Error('Body too large')); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error('Invalid JSON')); }
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

// ── HTTPS request helper ──

function httpsRequest(url, options, reqBody) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const data = reqBody ? (typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody)) : null;
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'POST',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);

    const req = mod.request(opts, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(chunks) }); }
        catch { resolve({ status: res.statusCode, data: chunks }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('Request timeout')));
    if (data) req.write(data);
    req.end();
  });
}

// ══════════════════════════════════════════════
//  AI Provider — reads openclaw.json for keys
// ══════════════════════════════════════════════

function resolveEnvVar(value) {
  if (typeof value !== 'string') return value;
  const m = value.match(/^\$\{(.+)\}$/);
  return m ? (process.env[m[1]] || value) : value;
}

function getAIProvider() {
  try {
    const config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'));
    const providers = config.models?.providers || {};

    for (const name of ['anthropic', 'openai']) {
      if (providers[name]?.apiKey) {
        const p = { ...providers[name], name };
        p.apiKey = resolveEnvVar(p.apiKey);
        return p;
      }
    }
    for (const [name, provider] of Object.entries(providers)) {
      if (provider.apiKey) {
        const p = { ...provider, name };
        p.apiKey = resolveEnvVar(p.apiKey);
        return p;
      }
    }
    return null;
  } catch { return null; }
}

async function callAI(systemPrompt, messages, model) {
  const provider = getAIProvider();
  if (!provider) throw new Error('No AI provider configured — add one in /admin');

  const apiKey = provider.apiKey;
  if (!apiKey || apiKey.startsWith('${')) {
    throw new Error('API key not resolved — check /admin config');
  }

  if (provider.name === 'anthropic' && !provider.api) {
    return callAnthropicAPI(apiKey, systemPrompt, messages, model);
  }
  const baseUrl = provider.baseUrl || 'https://api.openai.com/v1';
  const defaultModel = provider.models?.[0]?.id || (provider.name === 'openai' ? 'gpt-4o' : 'gpt-3.5-turbo');
  return callOpenAIAPI(apiKey, baseUrl, systemPrompt, messages, model || defaultModel);
}

async function callAnthropicAPI(apiKey, systemPrompt, messages, model) {
  const result = await httpsRequest('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
  }, {
    model: model || 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: systemPrompt || 'You are a helpful assistant.',
    messages,
  });
  if (result.status !== 200) {
    const msg = result.data?.error?.message || JSON.stringify(result.data);
    throw new Error(`Anthropic ${result.status}: ${msg}`);
  }
  return result.data.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
}

async function callOpenAIAPI(apiKey, baseUrl, systemPrompt, messages, model) {
  const msgs = [];
  if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
  msgs.push(...messages);
  const result = await httpsRequest(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
  }, { model, messages: msgs, max_tokens: 4096 });
  if (result.status !== 200) {
    const msg = result.data?.error?.message || JSON.stringify(result.data);
    throw new Error(`OpenAI ${result.status}: ${msg}`);
  }
  return result.data.choices[0].message.content;
}

// ══════════════════════════════════════════════
//  Conversation management (in-memory, per user)
// ══════════════════════════════════════════════

function getConversation(channel, userId) {
  const key = `${channel}:${userId}`;
  const conv = conversations.get(key);
  if (!conv || Date.now() - conv.lastActive > CONV_TTL) {
    if (conv) conversations.delete(key);
    return [];
  }
  return conv.messages;
}

function addToConversation(channel, userId, role, content) {
  const key = `${channel}:${userId}`;
  let conv = conversations.get(key);
  if (!conv || Date.now() - conv.lastActive > CONV_TTL) {
    conv = { messages: [], lastActive: Date.now() };
  }
  conv.messages.push({ role, content });
  conv.lastActive = Date.now();
  if (conv.messages.length > CONV_MAX_MESSAGES) {
    conv.messages = conv.messages.slice(-CONV_MAX_MESSAGES);
  }
  conversations.set(key, conv);
}

// ══════════════════════════════════════════════
//  Feishu SDK — WSClient long connection
// ══════════════════════════════════════════════

let lark = null;

function loadLarkSDK() {
  if (lark) return lark;
  try {
    lark = require('@larksuiteoapi/node-sdk');
    return lark;
  } catch (err) {
    console.error('Failed to load @larksuiteoapi/node-sdk:', err.message);
    return null;
  }
}

function startFeishuChannel(channelName, channel) {
  const sdk = loadLarkSDK();
  if (!sdk) {
    console.error(`[${channelName}] Cannot start — Feishu SDK not available`);
    return;
  }

  // Stop existing connection if any
  stopFeishuChannel(channelName);

  const { appId, appSecret } = channel.config;
  if (!appId || !appSecret) {
    console.error(`[${channelName}] Missing appId or appSecret`);
    return;
  }

  // Create Lark Client for API calls (send messages)
  const client = new sdk.Client({ appId, appSecret });

  // Create WSClient for receiving events via long connection
  const wsClient = new sdk.WSClient({
    appId,
    appSecret,
    loggerLevel: sdk.LoggerLevel.info,
  });

  // Start long connection with event dispatcher
  wsClient.start({
    eventDispatcher: new sdk.EventDispatcher({}).register({
      'im.message.receive_v1': async (data) => {
        handleFeishuSDKMessage(channelName, channel, client, data).catch((err) => {
          console.error(`[${channelName}] Message error:`, err.message);
        });
      },
    }),
  });

  feishuClients.set(channelName, { wsClient, client });
  console.log(`[${channelName}] Feishu WSClient started (long connection)`);
}

function stopFeishuChannel(channelName) {
  const existing = feishuClients.get(channelName);
  if (existing) {
    // WSClient doesn't expose a close method directly, but removing reference
    // allows GC; on process restart it reconnects automatically
    feishuClients.delete(channelName);
    console.log(`[${channelName}] Feishu WSClient stopped`);
  }
}

async function handleFeishuSDKMessage(channelName, channel, client, data) {
  const message = data.message;
  const sender = data.sender;

  // Only handle text messages
  if (message.message_type !== 'text') {
    console.log(`[${channelName}] Skipping ${message.message_type} message`);
    return;
  }

  // Parse text
  let text;
  try {
    text = JSON.parse(message.content).text || '';
  } catch {
    text = message.content || '';
  }

  // In group chats, strip @bot mentions
  if (message.chat_type === 'group' && message.mentions) {
    for (const m of message.mentions) {
      text = text.replace(m.key, '').trim();
    }
  }
  if (!text) return;

  const userId = sender.sender_id?.open_id || sender.sender_id?.user_id || 'unknown';
  console.log(`[${channelName}] ${userId}: ${text.substring(0, 80)}`);

  // Re-read channel config for latest systemPrompt / model
  const cfg = readConfig();
  const freshChannel = cfg.channels?.[channelName] || channel;

  // Build conversation history
  addToConversation(channelName, userId, 'user', text);
  const history = getConversation(channelName, userId);

  try {
    const reply = await callAI(freshChannel.systemPrompt || '', history, freshChannel.model);
    addToConversation(channelName, userId, 'assistant', reply);

    // Reply via Feishu SDK
    await client.im.message.reply({
      path: { message_id: message.message_id },
      data: {
        msg_type: 'text',
        content: JSON.stringify({ text: reply }),
      },
    });
    console.log(`[${channelName}] Replied to ${userId} (${reply.length} chars)`);
  } catch (err) {
    console.error(`[${channelName}] Error:`, err.message);
    // Send error feedback
    try {
      await client.im.message.reply({
        path: { message_id: message.message_id },
        data: {
          msg_type: 'text',
          content: JSON.stringify({ text: `[Error] ${err.message}` }),
        },
      });
    } catch (e) {
      console.error(`[${channelName}] Failed to send error reply:`, e.message);
    }
  }
}

// ══════════════════════════════════════════════
//  Channel lifecycle management
// ══════════════════════════════════════════════

function syncFeishuChannels() {
  const cfg = readConfig();
  const channels = cfg.channels || {};

  // Start enabled feishu channels that aren't running
  for (const [name, ch] of Object.entries(channels)) {
    if (ch.type === 'feishu' && ch.enabled && !feishuClients.has(name)) {
      startFeishuChannel(name, ch);
    }
    // Stop disabled channels that are running
    if (ch.type === 'feishu' && !ch.enabled && feishuClients.has(name)) {
      stopFeishuChannel(name);
    }
  }

  // Stop channels that were deleted
  for (const name of feishuClients.keys()) {
    if (!channels[name]) {
      stopFeishuChannel(name);
    }
  }
}

// ══════════════════════════════════════════════
//  Routes
// ══════════════════════════════════════════════

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  try {
    // ── GET /api/channels ──
    if (req.method === 'GET' && pathname === '/api/channels') {
      const config = readConfig();
      const channels = config.channels || {};
      const result = {};
      for (const [name, ch] of Object.entries(channels)) {
        const masked = maskChannelSecrets(ch);
        // Add connection status for feishu channels
        if (ch.type === 'feishu') {
          masked.connected = feishuClients.has(name);
        }
        result[name] = masked;
      }
      return sendJSON(res, 200, { channels: result, platforms: PLATFORMS });
    }

    // ── POST /api/channels ──
    if (req.method === 'POST' && pathname === '/api/channels') {
      const body = await parseBody(req);
      const { name, type, enabled, config: chConfig, systemPrompt, model } = body;

      if (!name || typeof name !== 'string') return sendJSON(res, 400, { error: 'Missing channel name' });
      if (!type || !PLATFORMS[type]) return sendJSON(res, 400, { error: 'Invalid platform type' });
      if (!chConfig || typeof chConfig !== 'object') return sendJSON(res, 400, { error: 'Missing config' });

      const cfg = readConfig();
      if (!cfg.channels) cfg.channels = {};

      const existing = cfg.channels[name];
      if (existing && existing.config) {
        const platformDef = PLATFORMS[type];
        for (const field of platformDef.fields) {
          if (field.secret && !chConfig[field.key] && existing.config[field.key]) {
            chConfig[field.key] = existing.config[field.key];
          }
        }
      }

      cfg.channels[name] = {
        type,
        enabled: enabled !== false,
        config: chConfig,
        systemPrompt: systemPrompt || '',
        model: model || '',
        updatedAt: new Date().toISOString(),
        createdAt: existing?.createdAt || new Date().toISOString(),
      };

      writeConfig(cfg);

      // Sync feishu connections after config change
      syncFeishuChannels();

      return sendJSON(res, 200, { ok: true, message: `Channel "${name}" saved` });
    }

    // ── POST /api/channels/:name/toggle ──
    if (req.method === 'POST' && /^\/api\/channels\/[^/]+\/toggle$/.test(pathname)) {
      const name = decodeURIComponent(pathname.split('/')[3]);
      const cfg = readConfig();
      if (!cfg.channels?.[name]) return sendJSON(res, 404, { error: `Channel "${name}" not found` });

      cfg.channels[name].enabled = !cfg.channels[name].enabled;
      cfg.channels[name].updatedAt = new Date().toISOString();
      writeConfig(cfg);

      // Sync feishu connections
      syncFeishuChannels();

      return sendJSON(res, 200, {
        ok: true,
        enabled: cfg.channels[name].enabled,
        message: cfg.channels[name].enabled ? `Channel "${name}" enabled` : `Channel "${name}" disabled`,
      });
    }

    // ── DELETE /api/channels/:name ──
    if (req.method === 'DELETE' && pathname.startsWith('/api/channels/')) {
      const name = decodeURIComponent(pathname.slice('/api/channels/'.length));
      if (!name) return sendJSON(res, 400, { error: 'Missing channel name' });

      const cfg = readConfig();
      if (!cfg.channels?.[name]) return sendJSON(res, 404, { error: `Channel "${name}" not found` });

      delete cfg.channels[name];
      writeConfig(cfg);

      // Stop connection if running
      stopFeishuChannel(name);

      return sendJSON(res, 200, { ok: true, message: `Channel "${name}" deleted` });
    }

    // ── Webhook (kept for non-SDK platforms) ──
    if (pathname.startsWith('/webhook/')) {
      const name = decodeURIComponent(pathname.slice('/webhook/'.length).split('/')[0]);
      const cfg = readConfig();
      const channel = cfg.channels?.[name];

      if (!channel) return sendJSON(res, 404, { error: 'Channel not found' });
      if (!channel.enabled) return sendJSON(res, 403, { error: 'Channel is disabled' });

      if (req.method === 'POST') {
        const body = await parseBody(req);
        console.log(`[${name}] Webhook received (${channel.type})`);
        return sendJSON(res, 200, { ok: true });
      }

      return sendJSON(res, 200, { ok: true });
    }

    // ── GET /healthz ──
    if (req.method === 'GET' && pathname === '/healthz') {
      return sendJSON(res, 200, { ok: true });
    }

    sendJSON(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('Error:', err.message);
    sendJSON(res, 500, { error: err.message });
  }
}

// ── Start ──

readConfig();
console.log(`Channels config ready: ${CONFIG_PATH}`);

const server = http.createServer(handleRequest);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Channels API listening on :${PORT}`);

  // Auto-start all enabled feishu channels
  syncFeishuChannels();
});
