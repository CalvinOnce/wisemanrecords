// Cloudflare Pages Function. Auto-routes to /api/plays.
// Requires a KV namespace binding named PLAYS on the Pages project.
//   Cloudflare dashboard -> Workers & Pages -> wisemanrecords ->
//     Settings -> Functions -> KV namespace bindings -> Add
//   Variable name: PLAYS
//   KV namespace: (create or pick one — e.g. "wiseman-plays")

const VALID_MILESTONES = new Set(["p25", "p50", "p75", "complete"]);

const json = (data, status = 200, extra = {}) =>
    new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...extra },
    });

export async function onRequestGet(context) {
    const kv = context.env.PLAYS;
    if (!kv) return json({ error: "PLAYS KV not bound" }, 500);
    try {
        const list = await kv.list();
        const result = {};
        await Promise.all(
            list.keys.map(async ({ name }) => {
                const v = await kv.get(name);
                const count = parseInt(v || "0", 10);
                const [trackKey, milestone] = name.split(":");
                if (!result[trackKey]) result[trackKey] = {};
                result[trackKey][milestone || "plays"] = count;
            })
        );
        return json(result, 200, { "Cache-Control": "no-store" });
    } catch (err) {
        return json({ error: err && err.message ? err.message : String(err) }, 500);
    }
}

export async function onRequestPost(context) {
    const kv = context.env.PLAYS;
    if (!kv) return json({ error: "PLAYS KV not bound" }, 500);
    try {
        const url = new URL(context.request.url);
        const track = url.searchParams.get("track");
        const milestone = url.searchParams.get("milestone");
        const n = parseInt(track, 10);
        if (!Number.isInteger(n) || n < 1 || n > 99) {
            return json({ error: "invalid track" }, 400);
        }
        if (milestone && !VALID_MILESTONES.has(milestone)) {
            return json({ error: "invalid milestone" }, 400);
        }
        const key = milestone ? `${n}:${milestone}` : String(n);
        const current = parseInt((await kv.get(key)) || "0", 10);
        const next = current + 1;
        await kv.put(key, String(next));
        return json({ track: String(n), milestone: milestone || "plays", count: next });
    } catch (err) {
        return json({ error: err && err.message ? err.message : String(err) }, 500);
    }
}
