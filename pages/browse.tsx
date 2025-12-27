import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";

type ClassItem = {
  id: number;
  name: string;
  image_url?: string | null;
  sort_order?: number | null;
};

const ROOT_IDS = [1, 2, 66, 79, 112];

export default function BrowsePage() {
  const [items, setItems] = useState<ClassItem[]>([]);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/classes?ids=${ROOT_IDS.join(",")}`);
        const j = await r.json();
        if (j.error) throw new Error(j.error);
        setItems(j.items || []);
      } catch (e: any) {
        setErr(e?.message || String(e));
      }
    })();
  }, []);

  return (
    <>
      <Head>
        <title>تصفّح الأقسام | نشيدنا</title>
      </Head>

      <main style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>تصفّح الأقسام</h1>

        {err ? (
          <div style={{ padding: 12, border: "1px solid #f3c", borderRadius: 8 }}>
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
          {items.map((c) => (
            <Link
              key={c.id}
              href={`/browse/${c.id}`}
              style={{
                display: "block",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14,
                overflow: "hidden",
                textDecoration: "none",
              }}
            >
              <div style={{ aspectRatio: "16/9", background: "rgba(255,255,255,0.04)" }}>
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
                <div style={{ fontSize: 16, fontWeight: 700 }}>{c.name}</div>
                <div style={{ opacity: 0.7, fontSize: 13, marginTop: 4 }}>
                  اضغط للتصفح
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
