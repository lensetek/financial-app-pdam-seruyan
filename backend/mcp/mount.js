// Express handler untuk /mcp: bearer auth (token MCP) → transport Streamable HTTP.
// SDK 1.30 exports map broken utk glob subpaths — pakai absolute path dist/cjs (verified works).
const SDK = require('path').join(__dirname, '..', 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'cjs');
const { StreamableHTTPServerTransport } = require(SDK + '/server/streamableHttp');
const crypto = require('crypto');
const { extractBearer, verifyToken } = require('./auth');
const { createMcpServer } = require('./server');

// Map sessionId → { transport, mcp, tokenId }
const sessions = new Map();
// Rate limit inline: token_id → timestamps[]
const rateBuckets = new Map();

function rateLimitHit(tokenId) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const max = parseInt(process.env.MCP_RATE_LIMIT_PER_MIN || '60', 10);
  const arr = (rateBuckets.get(tokenId) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) {
    rateBuckets.set(tokenId, arr);
    return true;
  }
  arr.push(now);
  rateBuckets.set(tokenId, arr);
  return false;
}

module.exports = function (db) {
  return async function mcpHandler(req, res) {
    // 1. Kill switch
    if (String(process.env.MCP_ENABLED || 'false').toLowerCase() !== 'true') {
      return res.status(503).json({ error: 'MCP disabled' });
    }

    // 2. Auth: bearer token → verify → req.auth
    const token = extractBearer(req);
    if (!token) {
      return res.status(401).json({ jsonrpc: '2.0', error: { code: -32000, message: 'unauthorized' } });
    }
    let authInfo;
    try {
      authInfo = await verifyToken(db, token);
    } catch (err) {
      return res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'db error' } });
    }
    if (!authInfo) {
      return res.status(401).json({ jsonrpc: '2.0', error: { code: -32000, message: 'unauthorized' } });
    }
    if (rateLimitHit(authInfo.id)) {
      return res.status(429).json({ jsonrpc: '2.0', error: { code: -32000, message: 'rate limited' } });
    }
    // attach ke req.auth supaya SDK baca jadi authInfo per-message
    req.auth = { tokenId: authInfo.id, name: authInfo.name, roles: authInfo.roles, email: authInfo.created_by };

    // 3. Pilih transport: resume session (header Mcp-Session-Id) atau baru
    const sessionId = req.headers['mcp-session-id'];
    let session = sessionId ? sessions.get(sessionId) : null;

    // GET = SSE resume. Tanpa sessionId → 400.
    if (req.method === 'GET' && !session) {
      return res.status(400).send('Missing sessionId');
    }

    // 4. Teruskan ke transport
    try {
      if (!session) {
        // Initialize (belum ada sessionId): buat transport + McpServer baru per session.
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          enableJsonResponse: true
        });
        const mcp = createMcpServer(db);
        await mcp.connect(transport);
        // Bersihkan session dari map saat transport ditutup (cegah kebocoran koneksi/memori).
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) sessions.delete(sid);
        };
        await transport.handleRequest(req, res, req.body);
        // sessionId di-set oleh transport saat initialize diproses. Register ke map sekarang.
        const sid = transport.sessionId;
        if (sid && !sessions.has(sid)) {
          sessions.set(sid, { transport, mcp, tokenId: authInfo.id });
        }
      } else {
        await session.transport.handleRequest(req, res, req.body);
      }
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'transport error: ' + err.message } });
      } else {
        res.end();
      }
    }
  };
};