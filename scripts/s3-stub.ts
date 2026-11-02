/**
 * Minimal S3-compatible stub for local testing of src/lib/s3-storage.ts
 * (bun scripts/s3-stub.ts — listens on 127.0.0.1:4566, path-style addressing).
 * Auth is accepted unconditionally; enough surface: PUT/HEAD/GET/DELETE.
 */
const store = new Map<string, { body: Uint8Array; contentType: string }>();

Bun.serve({
  hostname: "127.0.0.1",
  port: 4566,
  async fetch(req) {
    const url = new URL(req.url);
    // Path-style: /{bucket}/{key...}
    const segments = url.pathname.split("/").filter(Boolean);
    const key = segments.slice(1).join("/");

    if (req.method === "PUT") {
      const body = new Uint8Array(await req.arrayBuffer());
      store.set(key, { body, contentType: req.headers.get("content-type") || "application/octet-stream" });
      return new Response(null, { status: 200, headers: { ETag: `"stub-${Date.now()}"` } });
    }
    if (req.method === "HEAD") {
      const obj = store.get(key);
      if (!obj) return new Response(null, { status: 404 });
      return new Response(null, {
        status: 200,
        headers: { "Content-Length": String(obj.body.byteLength), "Content-Type": obj.contentType },
      });
    }
    if (req.method === "GET") {
      const obj = store.get(key);
      if (!obj) return new Response("NoSuchKey", { status: 404 });
      return new Response(obj.body, {
        status: 200,
        headers: { "Content-Type": obj.contentType, "Content-Length": String(obj.body.byteLength) },
      });
    }
    if (req.method === "DELETE") {
      store.delete(key);
      return new Response(null, { status: 204 });
    }
    return new Response("stub: unsupported", { status: 400 });
  },
});

console.log("s3-stub listening on http://127.0.0.1:4566");
