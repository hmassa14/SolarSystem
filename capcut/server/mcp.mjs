// Minimal MCP server over stdio (JSON-RPC 2.0, newline-delimited). No dependencies.
// Supports: initialize, notifications/initialized, ping, tools/list, tools/call.
import readline from "node:readline";

export class McpServer {
  constructor({ name, version }) {
    this.info = { name, version };
    this.tools = new Map();
  }
  tool(name, description, inputSchema, handler) {
    this.tools.set(name, { name, description, inputSchema, handler });
    return this;
  }
  async handle(msg) {
    const { id, method, params } = msg;
    const reply = (result) => ({ jsonrpc: "2.0", id, result });
    const fail = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
    switch (method) {
      case "initialize":
        return reply({
          protocolVersion: params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: this.info,
        });
      case "notifications/initialized":
      case "notifications/cancelled":
        return null;
      case "ping":
        return reply({});
      case "tools/list":
        return reply({
          tools: [...this.tools.values()].map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
        });
      case "tools/call": {
        const t = this.tools.get(params?.name);
        if (!t) return fail(-32602, `unknown tool: ${params?.name}`);
        try {
          const out = await t.handler(params?.arguments ?? {});
          const text = typeof out === "string" ? out : JSON.stringify(out, null, 2);
          return reply({ content: [{ type: "text", text }], isError: false });
        } catch (e) {
          return reply({ content: [{ type: "text", text: `ERROR: ${e?.message ?? e}` }], isError: true });
        }
      }
      default:
        if (id === undefined) return null; // unknown notification
        return fail(-32601, `method not found: ${method}`);
    }
  }
  listen() {
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    const send = (obj) => { if (obj) process.stdout.write(JSON.stringify(obj) + "\n"); };
    rl.on("line", async (line) => {
      line = line.trim();
      if (!line) return;
      let msg;
      try { msg = JSON.parse(line); } catch { return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }
      const msgs = Array.isArray(msg) ? msg : [msg];
      for (const m of msgs) send(await this.handle(m));
    });
    rl.on("close", () => process.exit(0));
  }
}

// Tiny schema helpers so tool definitions stay readable.
export const S = {
  str: (description, extra = {}) => ({ type: "string", description, ...extra }),
  num: (description, extra = {}) => ({ type: "number", description, ...extra }),
  int: (description, extra = {}) => ({ type: "integer", description, ...extra }),
  bool: (description) => ({ type: "boolean", description }),
  arr: (items, description) => ({ type: "array", items, description }),
  obj: (properties, required = [], description) => ({ type: "object", properties, required, additionalProperties: false, ...(description ? { description } : {}) }),
};
