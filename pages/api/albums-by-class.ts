import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

type ClassRow = { id: number; parent_id: number | null };

let cachedTree: { at: number; rows: ClassRow[] } | null = null;
const CACHE_MS = 5 * 60 * 1000;

async function getClassesTree(): Promise<ClassRow[]> {
  const now = Date.now();
  if (cachedTree && now - cachedTree.at < CACHE_MS) return cachedTree.rows;

  const { data, error } = await supabase.from("classes").select("id,parent_id");
  if (error) throw error;

  const rows = (data ?? []) as any as ClassRow[];
  cachedTree = { at: now, rows };
  return rows;
}

function subtreeIds(rows: ClassRow[], rootId: number): number[] {
  const children = new Map<number, number[]>();
  for (const r of rows) {
    const pid = r.parent_id ?? -1;
    if (!children.has(pid)) children.set(pid, []);
    children.get(pid)!.push(r.id);
  }

  const out: number[] = [];
  const stack = [rootId];
  const seen = new Set<number>();

  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);

    const ch = children.get(cur) ?? [];
    for (const c of ch) stack.push(c);
  }
  return out;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return res.status(405).json({ count: 0, items: [], error: 'method_not_allowed' });
    }

    const classId = parseInt(String(req.query.class_id ?? ""), 10);
    if (!Number.isFinite(classId)) {
      return res.status(200).json({ count: 0, items: [], error: "missing/invalid class_id" });
    }

    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
    const rawLimit = parseInt(String(req.query.limit ?? "36"), 10) || 36;
    const limit = Math.min(Math.max(rawLimit, 1), 60);
    const rawOffset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
    const offset = Math.min(Math.max(rawOffset, 0), 3000);

    const rows = await getClassesTree();
    const ids = subtreeIds(rows, classId);

    let qc = supabase
      .from("albums")
      .select("id", { head: true, count: "exact" })
      .in("class_id", ids);

    if (q) qc = qc.ilike("title", `%${q}%`);

    const { count, error: errCount } = await qc;
    if (errCount) throw errCount;

    let qd = supabase
      .from("albums")
      .select("id,title,year,cover_url,info,class_id")
      .in("class_id", ids);

    if (q) qd = qd.ilike("title", `%${q}%`);

    const { data, error: errData } = await qd
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);

    if (errData) throw errData;

    res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=1800, stale-while-revalidate=3600');
    res.status(200).json({ count: count ?? 0, items: data ?? [] });
  } catch (err: any) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ count: 0, items: [], error: err?.message || String(err) });
  }
}
