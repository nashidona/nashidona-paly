import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";

type ClassItem = {
  id: number;
  name: string;
  image_url?: string | null;
  sort_order?: number | null;
};

const ROOT_IDS = [1, 2, 66, 79, 112];

const ROOT_LABELS: Record<number, string> = {
  1: "الألبومات",
  2: "المنشدين",
  66: "فرق إنشادية",
  79: "أناشيد أطفال",
  112: "أغاني الثورة السورية",
};

export default function BrowsePage() {
  const [items, setItems] = useState<ClassItem[]>([]);
  const [err, setErr] = useState<string>("");
  const [q, setQ] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/classes?ids=${ROOT_IDS.join(",")}`);
        const j = await r.json();
        if (j.error) throw new Error(j.error);

        // ✅ ترتيب ثابت حسب ROOT_IDS
        const map = new Map<number, ClassItem>();
        (j.items || []).forEach((x: ClassItem) => map.set(x.id, x));
        const ordered = ROOT_IDS.map((id) => map.get(id)).filter(Boolean) as ClassItem[];
        setItems(ordered);
      } catch (e: any) {
        setErr(e?.message || String(e));
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((c) => (c.name || "").toLowerCase().includes(s));
  }, [items, q]);

  return (
    <>
      <Head>
        <title>تصفّح الأقسام | نشيدنا</title>
      </Head>

      <main style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <Link href="/" style={{ textDecoration: "none", opacity: 0.8 }}>
            ← الرئيسية
          </Link>
          <div style={{ flex: 1 }} />
        </div>

        <h1 style={{ fontSize: 24, marginBottom: 10 }}>تصفّح الأقسام</h1>

        {/* ✅ أزرار سريعة */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {ROOT_IDS.map((id) => (
            <Link
              key={id}
              href={`/browse/${id}`}
              style={{
                padding: "9px 12px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "#fff",
                textDecoration: "none",
                fontSize: 13,
              }}
            >
              {ROOT_LABELS[id] || `قسم ${id}`}
            </Link>
          ))}
        </div>

        {err ? (
          <div style={{ padding: 12, border: "1px solid #f3c", borderRadius: 8, marginTop: 12 }}>
            خطأ: {err}
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
            marginTop: 12,
          }}
        >
          {filtered.map((c) => (
            <Link
              key={c.id}
              href={`/browse/${c.id}`}
              style={{
                display: "block",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                overflow: "hidden",
                textDecoration: "none",
                background: "#fff",
              }}
            >
              <div style={{ aspectRatio: "16/9", background: "rgba(0,0,0,0.03)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.image_url || "/logo.png"}
                  alt={c.name}
                  loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = "/logo.png";
                  }}
                />
              </div>

              <div style={{ padding: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{c.name}</div>
                <div style={{ opacity: 0.7, fontSize: 13, marginTop: 4 }}>اضغط للتصفح</div>
              </div>
            </Link>
          ))}
        </div>

        {!err && items.length > 0 && filtered.length === 0 ? (
          <div style={{ marginTop: 12, opacity: 0.7 }}>لا يوجد نتائج مطابقة.</div>
        ) : null}
      </main>
    </>
  );
}
