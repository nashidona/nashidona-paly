import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

type ClassItem = {
  id: number;
  name: string;
  image_url?: string | null;
  parent_id?: number | null;
};

type AlbumItem = {
  id: number;
  title: string;
  cover_url?: string | null;
  info?: string | null;
  class_id?: number | null;
  year?: string | null;
};

const PAGE_SIZE = 36;

export default function BrowseClassPage() {
  const router = useRouter();
  const classId = useMemo(() => {
    const v = router.query.id;
    const n = parseInt(Array.isArray(v) ? v[0] : (v || "").toString(), 10);
    return Number.isFinite(n) ? n : null;
  }, [router.query.id]);

  const [cls, setCls] = useState<ClassItem | null>(null);
  const [children, setChildren] = useState<ClassItem[]>([]);
  const [albums, setAlbums] = useState<AlbumItem[]>([]);
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string>("");

  const hasMore = albums.length < count;

  useEffect(() => {
    if (!classId) return;

    setErr("");
    setCls(null);
    setChildren([]);
    setAlbums([]);
    setCount(0);

    (async () => {
      try {
        // load class itself (using ids=)
        const r1 = await fetch(`/api/classes?ids=${classId}`);
        const j1 = await r1.json();
        if (j1.error) throw new Error(j1.error);
        const c = (j1.items || [])[0] || null;
        setCls(c);

        // children
        const r2 = await fetch(`/api/classes?parent_id=${classId}`);
        const j2 = await r2.json();
        if (j2.error) throw new Error(j2.error);
        setChildren(j2.items || []);

        // first page albums
        await loadMore(classId, 0, true);
      } catch (e: any) {
        setErr(e?.message || String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  async function loadMore(id: number, offset: number, replace = false) {
    if (loading) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/albums-by-class?class_id=${id}&limit=${PAGE_SIZE}&offset=${offset}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error);

      setCount(j.count || 0);
      const newItems = j.items || [];
      setAlbums((prev) => (replace ? newItems : [...prev, ...newItems]));
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  // simple "Load more" button (reliable), we can convert to infinite scroll later if you want
  const onLoadMore = () => {
    if (!classId) return;
    loadMore(classId, albums.length, false);
  };

  return (
    <>
      <Head>
        <title>{cls ? `${cls.name} | تصفّح` : "تصفّح"} | نشيدنا</title>
      </Head>

      <main style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Link href="/browse" style={{ textDecoration: "none", opacity: 0.8 }}>
            ← رجوع
          </Link>

          <div style={{ flex: 1 }} />

          {cls?.parent_id ? (
            <Link href={`/browse/${cls.parent_id}`} style={{ textDecoration: "none", opacity: 0.8 }}>
              ↑ القسم الأعلى
            </Link>
          ) : null}
        </div>

        {err ? (
          <div style={{ padding: 12, border: "1px solid #f3c", borderRadius: 8, marginBottom: 12 }}>
            خطأ: {err}
          </div>
        ) : null}

        {/* Header */}
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            padding: 12,
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            marginBottom: 12,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cls?.image_url || "/logo.png"}
            alt={cls?.name || "قسم"}
            style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = "/logo.png";
            }}
          />
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{cls?.name || "..."}</div>
            <div style={{ opacity: 0.7, marginTop: 2 }}>
              {count ? `${count} ألبوم` : ""}
            </div>
          </div>
        </div>

       {/* Children */}
{children.length ? (
  <div style={{ marginBottom: 16 }}>
    <div style={{ marginBottom: 8, opacity: 0.8 }}>الأقسام الفرعية</div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
        gap: 12,
      }}
    >
      {children.map((ch) => (
        <Link
          key={ch.id}
          href={`/browse/${ch.id}`}
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
              src={ch.image_url || "/logo.png"}
              alt={ch.name}
              loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/logo.png";
              }}
            />
          </div>

          <div style={{ padding: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.3 }}>{ch.name}</div>
          </div>
        </Link>
      ))}
    </div>
  </div>
) : null}


        {/* Albums */}
        <div style={{ marginBottom: 8, opacity: 0.8 }}>الألبومات</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {albums.map((a) => (
            <Link
              key={a.id}
              href={`/album/${a.id}`}
              style={{
                display: "block",
                textDecoration: "none",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              <div style={{ aspectRatio: "1/1", background: "rgba(255,255,255,0.04)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.cover_url || "/logo.png"}
                  alt={a.title}
                  loading="lazy"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = "/logo.png";
                  }}
                />
              </div>
              <div style={{ padding: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{a.title}</div>
                {a.year ? (
                  <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>{a.year}</div>
                ) : null}
              </div>
            </Link>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
          {hasMore ? (
            <button
              onClick={onLoadMore}
              disabled={loading}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "transparent",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "تحميل..." : "تحميل المزيد"}
            </button>
          ) : (
            <div style={{ opacity: 0.7 }}>{count ? "انتهت النتائج" : ""}</div>
          )}
        </div>
      </main>
    </>
  );
}
