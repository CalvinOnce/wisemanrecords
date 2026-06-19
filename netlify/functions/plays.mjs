import { getStore } from "@netlify/blobs";

const STORE = "brass-tax-plays";

export default async (req) => {
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
            return Response.json(result, {
                headers: { "Cache-Control": "no-store" },
            });
        }

        if (req.method === "POST") {
            const url = new URL(req.url);
            const track = url.searchParams.get("track");
            const n = parseInt(track, 10);
            if (!Number.isInteger(n) || n < 1 || n > 99) {
                return new Response("invalid track", { status: 400 });
            }
            const key = String(n);
            const current = parseInt((await store.get(key)) || "0", 10);
            const next = current + 1;
            await store.set(key, String(next));
            return Response.json({ track: key, count: next });
        }

        return new Response("method not allowed", { status: 405 });
    } catch (err) {
        console.error("plays function error:", err);
        return Response.json(
            {
                error: err && err.message ? err.message : String(err),
                name: err && err.name ? err.name : undefined,
                stack: err && err.stack ? err.stack : undefined,
            },
            { status: 500 }
        );
    }
};

export const config = { path: "/api/plays" };
