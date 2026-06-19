import { getStore } from "@netlify/blobs";

const STORE = "brass-tax-plays";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
};

const json = (data, status = 200, extra = {}) =>
    new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...CORS, ...extra },
    });

export default async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS });
    }

    try {
        const store = getStore(STORE);

        if (req.method === "GET") {
            const { blobs } = await store.list();
            const result = {};
            await Promise.all(
                blobs.map(async ({ key }) => {
                    const val = await store.get(key);
                    result[key] = parseInt(val || "0", 10);
                })
            );
            return json(result, 200, { "Cache-Control": "no-store" });
        }

        if (req.method === "POST") {
            const url = new URL(req.url);
            const track = url.searchParams.get("track");
            const n = parseInt(track, 10);
            if (!Number.isInteger(n) || n < 1 || n > 99) {
                return json({ error: "invalid track" }, 400);
            }
            const key = String(n);
            const current = parseInt((await store.get(key)) || "0", 10);
            const next = current + 1;
            await store.set(key, String(next));
            return json({ track: key, count: next });
        }

        return json({ error: "method not allowed" }, 405);
    } catch (err) {
        console.error("plays function error:", err);
        return json(
            {
                error: err && err.message ? err.message : String(err),
                name: err && err.name ? err.name : undefined,
            },
            500
        );
    }
};
