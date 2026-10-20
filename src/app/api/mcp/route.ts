import { handleMcpPost } from "@/lib/mcp-server";

/**
 * MCP (Model Context Protocol) endpoint — Streamable HTTP transport.
 *
 * Personal URL shape:  <site>/api/mcp?token=<FLR token>&key=<CometAPI key>
 * Plug it into ChatGPT (Apps & Connectors / Developer mode) or any MCP client
 * (Claude, Cursor, …) as a remote "Streamable HTTP" server.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** JSON-RPC POST (initialize / tools/list / tools/call …). */
export async function POST(request: Request) {
  return handleMcpPost(request);
}

/** No server-initiated SSE streams in stateless mode — allowed by the spec. */
export async function GET() {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32000,
        message:
          "Method not allowed: SSE server streams are not supported. POST JSON-RPC messages instead.",
      },
    }),
    {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        Allow: "POST, OPTIONS",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    }
  );
}

/** Stateless server — session termination is not applicable. */
export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS" } });
}

/** CORS preflight for browser-based MCP clients. */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Accept, Authorization, MCP-Session-Id, Last-Event-ID, mcp-protocol-version, x-api-key",
      "Access-Control-Expose-Headers": "MCP-Session-Id",
      "Access-Control-Max-Age": "86400",
    },
  });
}
