// Membangun McpServer + tool registry dengan role filtering per-session.
// SDK 1.30 exports map broken utk glob subpaths — pakai absolute path dist/cjs (verified works).
const SDK = require('path').join(__dirname, '..', 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'cjs');
const { McpServer } = require(SDK + '/server/mcp');
const { ListToolsRequestSchema, CallToolRequestSchema } = require(SDK + '/types');
const { normalizeObjectSchema } = require(SDK + '/server/zod-compat');
const { toJsonSchemaCompat } = require(SDK + '/server/zod-json-schema-compat');
const EMPTY_OBJECT_JSON_SCHEMA = { type: 'object', properties: {} };
const registry = require('./registry');
const { toMcpError, McpError } = require('./errors');

function createMcpServer(db) {
  const mcp = new McpServer({
    name: 'pdam-seruyan-mcp',
    version: '1.0.0'
  });

  // Daftarkan semua tool dari registry. Tiap tool punya `requiredRoles` untuk filter.
  for (const tool of registry.tools) {
    mcp.registerTool(tool.name, {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: undefined,
      annotations: tool.annotations,
      _meta: { roles: tool.requiredRoles },
    }, async (args, extra) => {
      const authInfo = extra?.authInfo || {};
      const roles = authInfo.roles || ['viewer'];
      // runtime double-check role
      const required = tool.requiredRoles || [];
      const allowed = required.length === 0 || required.some(r => roles.includes(r));
      if (!allowed) {
        throw new McpError(-32000, 'Forbidden: role tidak cukup untuk ' + tool.name);
      }
      try {
        const result = await tool.handler(db, args, authInfo);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        throw toMcpError(err);
      }
    });
  }

  // Override tools/list untuk filter berdasar role dari authInfo per-session.
  mcp.server.setRequestHandler(ListToolsRequestSchema, async (request, extra) => {
    const authInfo = extra?.authInfo || {};
    const roles = authInfo.roles || ['viewer'];
    const visible = registry.tools.filter(t =>
      !t.requiredRoles || t.requiredRoles.length === 0 || t.requiredRoles.some(r => roles.includes(r))
    );
    return {
      tools: visible.map(t => {
        const obj = normalizeObjectSchema(t.inputSchema);
        return {
          name: t.name,
          description: t.description,
          inputSchema: obj
            ? toJsonSchemaCompat(obj, { strictUnions: true, pipeStrategy: 'input' })
            : EMPTY_OBJECT_JSON_SCHEMA
        };
      })
    };
  });

  return mcp;
}

module.exports = { createMcpServer };