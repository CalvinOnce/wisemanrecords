// Diagnostic version: NO imports, NO Blobs.
// If this serves JSON at /.netlify/functions/plays the function pipeline works
// and we can layer Blobs back in. If this still returns site HTML, the routing
// itself is broken.
export default async (req) => {
    return new Response(
        JSON.stringify({ ok: true, method: req.method, ts: Date.now() }),
        { headers: { "Content-Type": "application/json" } }
    );
};
