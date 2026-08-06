// Map error → JSON-RPC error. SDK 1.30 McpError pakai struktur { code, message, data }.
class McpError extends Error {
  constructor(code, message, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

function toMcpError(err) {
  if (err instanceof McpError) return err;
  if (err && err.code && typeof err.code === 'number' && err.message) return err;
  return new McpError(-32603, 'Internal error: ' + (err && err.message ? err.message : String(err)));
}

module.exports = { McpError, toMcpError };