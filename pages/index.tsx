/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

// ===== Legacy maps (client-side) =====
// ضع الملفات التالية داخل /public:
//   /public/legacy_site_art.json
//   /public/legacy_site_class.json (اختياري حالياً)
type LegacyArtMap = Record<string, { name: string; in_class?: number | null }>;

let legacyArtPromise: Promise<LegacyArtMap | null> | null = null;

async function loadLegacyArtMap(): Promise<LegacyArtMap | null> {
  if (legacyArtPromise) return legacyArtPromise;
  legacyArtPromise = (async () => {
    try {
      const r = await fetch('/legacy_site_art.json', { cache: 'force-cache' });
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || typeof j !== 'object') return null;
      return j as LegacyArtMap;
    } catch {
      return null;
    }
  })();
  return legacyArtPromise;
}

// ===== Types =====
export type Track = {
  id: number | string;
  title: string;
  album?: string | null;
  artist?: string | null;
  artist_text?: string | null;
  class_parent?: string | null;
  class_child?: string | null;
  cover_url?: string | null;
  year?: string | null;
  has_lyrics?: boolean; // لإظهار أيقونة الكلمات فقط عند التوفر
};

type LoopMode = 'none' | 'queue' | 'one';

// ===== Utils =====
function fmt(sec: number) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function setMediaSession(
  tr: { id: any; title: string; artist?: string | null; album?: string | null; cover_url?: string | null },
  a?: HTMLAudioElement | null
) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  const cover = tr.cover_url || '/logo.png';
  const art = [
    { src: cover, sizes: '96x96', type: 'image/png' },
    { src: cover, sizes: '192x192', type: 'image/png' },
    { src: cover, sizes: '512x512', type: 'image/png' },
  ];
  // @ts-ignore
  navigator.mediaSession.metadata = new MediaMetadata({
    title: tr.title,
    artist: tr.artist || '',
    album: tr.album || '',
    artwork: art as any,
  });
  const play = () => a?.play().catch(() => {});
  const pause = () => a?.pause();
  // @ts-ignore
  navigator.mediaSession.setActionHandler('play', play);
  // @ts-ignore
  navigator.mediaSession.setActionHandler('pause', pause);
  // @ts-ignore
  navigator.mediaSession.setActionHandler('previoustrack', () => (window as any).__playPrev?.());
  // @ts-ignore
  navigator.mediaSession.setActionHandler('nexttrack', () => (window as any).__playNext?.());
  // @ts-ignore
  navigator.mediaSession.setActionHandler('seekbackward', (d: any) => {
    if (!a) return;
    a.currentTime = Math.max(0, a.currentTime - (d?.seekOffset || 10));
  });
  // @ts-ignore
  navigator.mediaSession.setActionHandler('seekforward', (d: any) => {
    if (!a) return;
    a.currentTime = Math.min(a.duration || 0, a.currentTime + (d?.seekOffset || 10));
  });
  // @ts-ignore
  navigator.mediaSession.setActionHandler('seekto', (d: any) => {
    if (!a || d.fastSeek) return;
    a.currentTime = d.seekTime || 0;
  });
  // @ts-ignore
  if (a && 'setPositionState' in (navigator as any).mediaSession) {
    // @ts-ignore
    (navigator as any).mediaSession.setPositionState({
      duration: a.duration || 0,
      position: a.currentTime || 0,
      playbackRate: a.playbackRate || 1,
    });
  }
}

// ===== Component =====
export default function Home() {
  // بحث
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 350);

  // ——— إظهار/إخفاء أناشيد الأطفال (افتراضيًا: مخفية) ———
  const [showKids, setShowKids] = useState(false);

  // ✅ Legacy handling (بدون loop)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const u = new URL(window.location.href);

      const songs = u.searchParams.get('songs'); // old site
      const classId = u.searchParams.get('class'); // old site
      const artId = u.searchParams.get('art'); // old site
      const play = u.searchParams.get('play'); // old site deep play
      const qParam = u.searchParams.get('q'); // new site

      // 0) لو في q بالفعل، خليه كما هو
      if (qParam && q.trim() === '') {
        setQ(qParam);
      }

      // 1) old: songs=class&class=ID  => browse
      if (songs === 'class' && classId && /^\d+$/.test(classId)) {
        window.location.replace(`/browse/${classId}`);
        return;
      }

      // 2) old: songs=art&art=ID => حاول نحولها لبحث باسم الألبوم (بدون redirect)
      // (ولا نقرب على play= حتى ما يصير loop)
      if (songs === 'art' && artId && /^\d+$/.test(artId)) {
        (async () => {
          const map = await loadLegacyArtMap();
          const hit = map?.[String(artId)];
          const name = (hit?.name || '').trim();
          if (!name) return;

          // عيّن البحث
          if (q.trim() === '') setQ(name);

          // نظّف رابط المستخدم: خلّيها ?q=... (+ play لو موجود) بدل ?songs=art&art=...
          const clean = new URL(window.location.origin + window.location.pathname);
          clean.searchParams.set('q', name);
          if (play && /^\d+$/.test(play)) clean.searchParams.set('play', play);
          window.history.replaceState({}, '', clean.toString());
        })();
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const v = localStorage.getItem('nd_show_kids');
      if (v === '1') setShowKids(true);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('nd_show_kids', showKids ? '1' : '0');
    } catch {}
  }, [showKids]);

  // نتائج/ترقيم
  const [items, setItems] = useState<Track[]>([]);
  const [count, setCount] = useState<number>(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  // بانر الألبوم
  const [albumInfo, setAlbumInfo] = useState<string>('');

  // واجهة/صوت
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [showLyrics, setShowLyrics] = useState<{ open: boolean; title?: string; text?: string }>({ open: false });

  // مشاركة/تعليقات
  const [fbOpen, setFbOpen] = useState(false);
  const [fbMsg, setFbMsg] = useState('');
  const [fbEmail, setFbEmail] = useState('');
  const [fbBusy, setFbBusy] = useState(false);
  const [fbOk, setFbOk] = useState<string>('');

  // قائمة التشغيل
  const [queue, setQueue] = useState<Track[]>([]);
  const [current, setCurrent] = useState<Track | null>(null);
  const [loop, setLoop] = useState<LoopMode>('queue');
  const [sleepAt, setSleepAt] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // تشغيل عبر ?play
  const [needsTap, setNeedsTap] = useState(false);
  const [incomingTrack, setIncomingTrack] = useState<Track | null>(null);

  // توفر كلمات
  const [lyricsMap, setLyricsMap] = useState<Record<string, boolean>>({});

  // صوت (حجم)
  const [vol, setVol] = useState<number>(1);

  // مراجع
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayPending = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  loadingRef.current = loading;

  // refs لعناصر النتائج والقائمة لأجل التمرير التلقائي
  const resultRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const queueRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // مراقبة التعليق/العطب
  const lastProgressRef = useRef<number>(0);
  const retryRef = useRef<number>(0);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const MAX_RETRIES = 2;
  const STUCK_MS = 15000;
  const CHECK_EVERY = 4000;

  // === حالة السحب في قائمة التشغيل ===
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  function startWatchdog(a: HTMLAudioElement | null) {
    stopWatchdog();
    if (!a) return;
    lastProgressRef.current = Date.now();
    watchdogRef.current = setInterval(() => {
      if (!a || a.paused) return;
      const since = Date.now() - lastProgressRef.current;
      if (since > STUCK_MS) {
        if (retryRef.current < MAX_RETRIES) {
          retryRef.current++;
          try {
            a.load();
            a.play().catch(() => {});
          } catch {}
          lastProgressRef.current = Date.now();
        } else {
          reportBad('stuck_no_progress', `no progress for ${since}ms after ${retryRef.current} retries`);
          playNext(true);
        }
      }
    }, CHECK_EVERY);
  }
  function stopWatchdog() {
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
  }

  function dedup(arr: Track[]) {
    const seen = new Set<string>();
    return arr.filter((x) => {
      const k = String(x.id);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  async function fetchPage(newOffset = 0, append = false) {
    setLoading(true);
    setErr('');
    try {
      const r = await fetch(
        `/api/search?q=${encodeURIComponent(dq)}&limit=60&offset=${newOffset}&include_kids=${showKids ? 1 : 0}&exclude_kids=${showKids ? 0 : 1}`
      );
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const page: Track[] = dedup(j.items || []);
      const total = typeof j.count === 'number' ? j.count : count;
      setCount(total);
      setHasMore(page.length === 60 || newOffset + page.length < total);
      setItems((prev) => (append ? dedup([...prev, ...page]) : page));
    } catch {
      setErr('تعذر جلب النتائج الآن');
      if (!append) setItems([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }

  // أول تحميل
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setOffset(0);
      setHasMore(true);
      setErr('');
      if (dq.trim() === '') {
        let initialRandomCount = 0;
        try {
          const r = await fetch(`/api/random?limit=60&include_kids=${showKids ? 1 : 0}&exclude_kids=${showKids ? 0 : 1}`);
          const j = await r.json();
          const arr: Track[] = Array.isArray(j.items) ? j.items : [];
          initialRandomCount = arr.length;
          if (!cancelled) setItems(dedup(shuffle(arr)));
        } catch {
          if (!cancelled) {
            setItems([]);
            setErr('تعذر جلب النتائج الآن');
            setHasMore(false);
          }
        }
        try {
          const r2 = await fetch(`/api/search?q=&limit=1&offset=0&include_kids=${showKids ? 1 : 0}&exclude_kids=${showKids ? 0 : 1}`);
          const j2 = await r2.json();
          const total = j2?.count || 0;
          if (!cancelled) {
            setCount(total);
            setHasMore(total ? total > initialRandomCount : true);
          }
        } catch {
          if (!cancelled) setHasMore(true);
        }
      } else {
        await fetchPage(0, false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [dq, showKids]);

  // تحضير توفر الكلمات بدون طلب 36 API/Supabase عند كل تحميل صفحة.
  // نعتمد على has_lyrics القادم من /api/search و/api/random، ونجلب الكلمات فقط عند ضغط المستخدم على الأيقونة.
  useEffect(() => {
    if (!items.length) return;
    setLyricsMap((m) => {
      let changed = false;
      const next = { ...m };
      for (const it of items) {
        const k = String(it.id);
        if (it.has_lyrics && next[k] !== true) {
          next[k] = true;
          changed = true;
        }
      }
      return changed ? next : m;
    });
  }, [items]);

  // تمرير لا نهائي
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          if (loadingRef.current) return;
          if (!hasMore) return;
          setOffset((prev) => {
            const next = prev + 60;
            fetchPage(next, true);
            return next;
          });
        });
      },
      { rootMargin: '200px' }
    );
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, [hasMore, dq]);

  // قفل التمرير عند فتح القائمة
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = open ? 'hidden' : prev || '';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // keyboard offset
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = (window as any).visualViewport;
    if (!vv) return;
    const onResize = () => {
      const diff = vv.height ? Math.round(window.innerHeight - vv.height) : 0;
      const kb = diff > 60 ? diff : 0;
      document.documentElement.style.setProperty('--kb', kb + 'px');
    };
    vv.addEventListener('resize', onResize);
    onResize();
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  // footer height -> bottom padding
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const measure = () => {
      const h = footerRef.current?.getBoundingClientRect().height || 140;
      document.documentElement.style.setProperty('--footerH', `${Math.round(h)}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (footerRef.current) ro.observe(footerRef.current);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, []);

  // استرجاع الحالة من التخزين المحلي
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const rawQueue = localStorage.getItem('nd_queue');
      const qArr: Track[] = rawQueue ? JSON.parse(rawQueue) : [];
      setQueue(Array.isArray(qArr) ? qArr : []);

      const rawCur = localStorage.getItem('nd_current');
      const curId = rawCur ? JSON.parse(rawCur) : null;
      if (curId && Array.isArray(qArr)) {
        const found = qArr.find((x) => String(x.id) === String(curId)) || null;
        setCurrent(found || null);
      }

      const rawLoop = localStorage.getItem('nd_loop') as LoopMode | null;
      if (rawLoop === 'none' || rawLoop === 'queue' || rawLoop === 'one') setLoop(rawLoop as LoopMode);
      const rawSleep = localStorage.getItem('nd_sleep');
      if (rawSleep) setSleepAt(JSON.parse(rawSleep));

      const rawVol = localStorage.getItem('nd_vol');
      const v = rawVol ? Math.max(0, Math.min(1, parseFloat(rawVol))) : 1;
      setVol(isFinite(v) ? v : 1);
      if (audioRef.current) audioRef.current.volume = isFinite(v) ? v : 1;
    } catch {}
    setHydrated(true);
  }, []);

  // ===== وظائف التشغيل =====
  function playNow(tr: Track) {
    setCurrent(tr);
    setQueue((q) => (q.find((x) => String(x.id) === String(tr.id)) ? q : [tr, ...q]));
    autoPlayPending.current = true;
    retryRef.current = 0;
    setMediaSession({ ...tr, artist: tr.artist || tr.artist_text, album: tr.album, cover_url: tr.cover_url }, audioRef.current);
    setTimeout(() => audioRef.current?.play().catch(() => {}), 0);
  }
  function addToQueue(tr: Track) {
    setQueue((q) => (q.find((x) => String(x.id) === String(tr.id)) ? q : [...q, tr]));
  }
  function clearQueue() {
    setQueue([]);
    setCurrent(null);
  }
  function removeFromQueue(id: Track['id']) {
    setQueue((q) => q.filter((x) => String(x.id) !== String(id)));
    if (current && String(current.id) === String(id)) setTimeout(() => playNext(true), 0);
  }
  function moveByIndex(from: number, to: number) {
    setQueue((q) => {
      if (from < 0 || from >= q.length) return q;
      const c = [...q];
      const [it] = c.splice(from, 1);
      const dest = Math.max(0, Math.min(to, c.length));
      c.splice(dest, 0, it);
      return c;
    });
  }
  function shuffleQueue() {
    setQueue((q) => {
      const c = [...q];
      for (let i = c.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [c[i], c[j]] = [c[j], c[i]];
      }
      return c;
    });
  }
  function playNext(autoplay = false) {
    setQueue((q) => {
      if (!q.length) {
        setCurrent(null);
        return q;
      }
      const idx = current ? q.findIndex((x) => String(x.id) === String(current.id)) : -1;
      const next = idx >= 0 && idx < q.length - 1 ? q[idx + 1] : q[0];
      setCurrent(next);
      retryRef.current = 0;
      if (autoplay) autoPlayPending.current = true;
      setMediaSession({ ...next, artist: next.artist || next.artist_text, album: next.album, cover_url: next.cover_url }, audioRef.current);
      return q;
    });
  }
  function playPrev(autoplay = false) {
    setQueue((q) => {
      if (!q.length) {
        setCurrent(null);
        return q;
      }
      const idx = current ? q.findIndex((x) => String(x.id) === String(current.id)) : -1;
      const prev = idx > 0 ? q[idx - 1] : q[q.length - 1];
      setCurrent(prev);
      retryRef.current = 0;
      if (autoplay) autoPlayPending.current = true;
      setMediaSession({ ...prev, artist: prev.artist || prev.artist_text, album: prev.album, cover_url: prev.cover_url }, audioRef.current);
      return q;
    });
  }
  function skipBy(delta: number) {
    const a = audioRef.current;
    if (!a) return;
    const next = Math.max(0, Math.min(a.duration || 0, (a.currentTime || 0) + delta));
    a.currentTime = next;
    setT(next);
  }

  // قفل أزرار الوسائط العالمية
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as any).__playNext = () => playNext(true);
    (window as any).__playPrev = () => playPrev(true);
  }, [queue, current]);

  // إرسال تقرير رابط معطوب
  async function reportBad(reason: string, detail?: string) {
    try {
      if (!current) return;
      await fetch('/api/report-bad-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: current.id, reason, detail: detail || '', retries: retryRef.current || 0 }),
      });
    } catch {}
  }

  // أحداث الصوت + مراقب التعليق
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onTime = () => {
      if ((a.currentTime || 0) > 0) lastProgressRef.current = Date.now();
      setT(a.currentTime || 0);
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && 'setPositionState' in (navigator as any).mediaSession) {
        (navigator as any).mediaSession.setPositionState({
          duration: a.duration || 0,
          position: a.currentTime || 0,
          playbackRate: a.playbackRate || 1,
        });
      }
      if (sleepAt && Date.now() >= sleepAt) {
        a.pause();
        setSleepAt(null);
      }
    };
    const onMeta = () => {
      setDur(a.duration || 0);
      lastProgressRef.current = Date.now();
      retryRef.current = 0;
      startWatchdog(a);
      a.volume = vol;
      if (autoPlayPending.current) {
        a.play().catch(() => {});
        autoPlayPending.current = false;
      }
    };
    const onEnd = () => {
      stopWatchdog();
      if (loop === 'one') {
        a.currentTime = 0;
        a.play().catch(() => {});
        return;
      }
      if (loop === 'queue') {
        playNext(true);
        return;
      }
      setT(0);
    };
    const onError = () => {
      if (retryRef.current < MAX_RETRIES) {
        retryRef.current++;
        try {
          a.load();
          a.play().catch(() => {});
        } catch {}
      } else {
        reportBad('media_error', (a.error && `code=${a.error.code}`) || 'unknown');
        playNext(true);
      }
    };
    const onAbort = () => {
      if (retryRef.current < MAX_RETRIES) {
        retryRef.current++;
        try {
          a.load();
          a.play().catch(() => {});
        } catch {}
      } else {
        reportBad('abort_no_data');
        playNext(true);
      }
    };

    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('ended', onEnd);
    a.addEventListener('error', onError);
    a.addEventListener('abort', onAbort);

    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('error', onError);
      a.removeEventListener('abort', onAbort);
      stopWatchdog();
    };
  }, [current, queue, loop, sleepAt, vol]);

  // حفظ الحالة محليًا — بعد الهيدرايشن
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      localStorage.setItem('nd_queue', JSON.stringify(queue));
    } catch {}
  }, [queue, hydrated]);
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      localStorage.setItem('nd_current', JSON.stringify(current?.id ?? null));
    } catch {}
  }, [current, hydrated]);
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      localStorage.setItem('nd_loop', loop);
    } catch {}
  }, [loop, hydrated]);
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      localStorage.setItem('nd_sleep', JSON.stringify(sleepAt));
    } catch {}
  }, [sleepAt, hydrated]);
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      localStorage.setItem('nd_vol', String(vol));
      if (audioRef.current) audioRef.current.volume = vol;
    } catch {}
  }, [vol, hydrated]);

  function startSleep(minutes: number) {
    const when = Date.now() + minutes * 60 * 1000;
    setSleepAt(when);
  }

  // إضافة كل النتائج إلى قائمة التشغيل
  async function addAllResultsToQueue() {
    if (dq.trim() === '') {
      if (!items.length) return;
      setQueue((q) => {
        const seen = new Set(q.map((x) => String(x.id)));
        const merged = [...q];
        items.forEach((tr) => {
          const k = String(tr.id);
          if (!seen.has(k)) {
            merged.push(tr);
            seen.add(k);
          }
        });
        return merged;
      });
      alert(`تمت إضافة ${items.length} إلى قائمة التشغيل`);
      return;
    }

    const total = count && count > 0 ? count : items.length;
    const cap = Math.min(total, 100);
    if (cap <= 0) return;

    if (cap > items.length && cap > 120) {
      if (!confirm(`سيتم إضافة حتى ${cap} أنشودة إلى القائمة. هل أنت متأكد؟`)) return;
    }

    let all = [...items];
    let nextOffset = items.length;
    const PAGE = 50;
    const maxLoops = 50;

    for (let loop = 0; all.length < cap && loop < maxLoops; loop++) {
      const r = await fetch(
        `/api/search?q=${encodeURIComponent(dq)}&limit=${PAGE}&offset=${nextOffset}&include_kids=${showKids ? 1 : 0}&exclude_kids=${showKids ? 0 : 1}`
      );
      if (!r.ok) break;
      const j = await r.json();
      const page: Track[] = Array.isArray(j.items) ? j.items : [];
      if (!page.length) break;

      const seen = new Set(all.map((x) => String(x.id)));
      for (const tr of page) {
        const k = String(tr.id);
        if (!seen.has(k)) {
          all.push(tr);
          seen.add(k);
        }
        if (all.length >= cap) break;
      }

      nextOffset += PAGE;
    }

    const slice = all.slice(0, cap);
    setQueue((q) => {
      const seen = new Set(q.map((x) => String(x.id)));
      const merged = [...q];
      slice.forEach((tr) => {
        const k = String(tr.id);
        if (!seen.has(k)) {
          merged.push(tr);
          seen.add(k);
        }
      });
      return merged;
    });
    alert(`تمت إضافة ${slice.length} إلى قائمة التشغيل`);
  }

  // حساب ألبوم وحيد في النتائج
  const singleAlbum = useMemo(() => {
    type SA = { title: string; year: string; cover: string } | null;
    if (!items.length) return null as SA;

    const uniq = Array.from(new Set(items.map((x) => (x.album || '').trim()))).filter(Boolean) as string[];
    if (uniq.length === 1) {
      const chosen = uniq[0];
      const sample = items.find((x) => (x.album || '').trim() === chosen) || items[0];
      return {
        title: chosen,
        year: (sample.year || '').toString(),
        cover: sample.cover_url || '/logo.png',
      } as SA;
    }
    return null as SA;
  }, [items]);

  // جلب معلومات الألبوم عند وجود ألبوم واحد
  useEffect(() => {
    let cancelled = false;
    if (singleAlbum?.title) {
      fetch(`/api/album?title=${encodeURIComponent(singleAlbum.title)}`)
        .then((r) => r.json())
        .then((j) => {
          if (!cancelled) setAlbumInfo((j?.info || '').trim());
        })
        .catch(() => {
          if (!cancelled) setAlbumInfo('');
        });
    } else {
      setAlbumInfo('');
    }
    return () => {
      cancelled = true;
    };
  }, [singleAlbum?.title]);

  // فتح كلمات النشيد
  async function openLyrics(tr: Track) {
    try {
      const r = await fetch(`/api/track?id=${tr.id}`);
      const j = await r.json();
      const errText = j && j.error ? String(j.error) : '';
      const txt = (j?.lyrics || '').trim();
      setShowLyrics({ open: true, title: tr.title, text: errText ? errText : txt || 'لا توجد كلمات متاحة.' });
    } catch {
      setShowLyrics({ open: true, title: tr.title, text: 'تعذر جلب الكلمات حالياً.' });
    }
  }

  // إرسال ملاحظة
  async function submitFeedback() {
    if (!fbMsg.trim()) {
      setFbOk('من فضلك اكتب ملاحظتك أولاً.');
      return;
    }
    setFbBusy(true);
    setFbOk('');
    try {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const page = typeof location !== 'undefined' ? location.href : '';
      const track_id = current ? current.id : null;
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: fbMsg.trim(), email: fbEmail.trim() || null, ua, page, track_id }),
      });
      const j = await r.json();
      if (j && j.ok) {
        setFbOk('✅ تم إرسال ملاحظتك، شكراً لك.');
        setFbMsg('');
        setFbEmail('');
        setTimeout(() => {
          setFbOpen(false);
          setFbOk('');
        }, 1200);
      } else {
        setFbOk('تم الاستلام محلياً، سنراجعها (قد لا يكون التخزين مفعلاً بعد).');
      }
    } catch {
      setFbOk('تعذّر الإرسال الآن، حاول لاحقاً.');
    } finally {
      setFbBusy(false);
    }
  }

  // ✅ تحميل قيمة q من الرابط (لاستخدام browse → album click / أو legacy-cleaned)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const u = new URL(window.location.href);
      const q0 = u.searchParams.get('q');
      if (q0 && q.trim() === '') setQ(q0);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تشغيل فوري عند فتح رابط المشاركة /?play=ID
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const u = new URL(window.location.href);
      const pid = u.searchParams.get('play');
      if (!pid || !/^\d+$/.test(pid)) return;
      (async () => {
        try {
          const r = await fetch('/api/track?id=' + pid + '&full=1', {
            headers: { accept: 'application/json' },
            cache: 'no-store',
          });
          const js = await r.json();
          const tr = js?.item;
          if (!tr || !tr.id || !tr.title) return;
          const t: Track = {
            id: tr.id,
            title: tr.title,
            album: tr.album || null,
            artist: tr.artist || tr.artist_text || null,
            artist_text: tr.artist || tr.artist_text || null,
            year: tr.year || null,
            cover_url: tr.cover_url || null,
            has_lyrics: !!(tr.lyrics && String(tr.lyrics).trim()),
          };
          playNow(t);
          const a = audioRef.current;
          if (a) {
            a.load();
            try {
              await a.play();
            } catch {
              setIncomingTrack(t);
              setNeedsTap(true);
            }
          } else {
            setIncomingTrack(t);
            setNeedsTap(true);
          }
          // تنظيف الرابط من ?play بعد المعالجة
          u.searchParams.delete('play');
          window.history.replaceState({}, '', u.toString());
        } catch {}
      })();
    } catch {}
  }, []);

  // === Render ===
  return (
    <div style={{ fontFamily: 'system-ui,-apple-system,Segoe UI,Tahoma', background: '#f8fafc', minHeight: '100vh' }}>
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, background: '#fff', borderBottom: '1px solid #e5e7eb', zIndex: 12 }}>
        <div
          style={{
            maxWidth: 960,
            margin: '0 auto',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <img src="/logo.png" width={36} height={36} alt="logo" />
            <b>Nashidona • النسخة التجريبية</b>
            <button onClick={() => setFbOpen(true)} className="fbBtn" title="أرسل ملاحظة">
              💬 ملاحظات
            </button>
          </div>
          <div className="stats" style={{ fontSize: 12, color: '#6b7280' }}>
            النتائج: {items.length}
            {count ? ` / ${count}` : ''}
          </div>
        </div>

        {/* Now playing mini bar */}
        {current && (
          <div className="nowBar" style={{ borderTop: '1px solid #f3f4f6', background: '#fafafa' }}>
            <div style={{ maxWidth: 960, margin: '0 auto', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <img
                src={current.cover_url || '/logo.png'}
                width={32}
                height={32}
                alt=""
                style={{ borderRadius: 6, objectFit: current.cover_url ? 'cover' : 'contain', background: current.cover_url ? undefined : '#f3f4f6' }}
              />
              <div style={{ minWidth: 0, flex: 1, lineHeight: 1.25 }}>
                <div className="two" style={{ fontWeight: 700, color: '#065f46' }}>
                  {current.title}
                </div>
                {(current.artist || current.artist_text) && <div style={{ fontSize: 12, color: '#4b5563' }}>{current.artist || current.artist_text}</div>}
              </div>
              <button
                className="ctl"
                onClick={() => {
                  const a = audioRef.current;
                  if (!a) return;
                  a.paused ? a.play() : a.pause();
                }}
                title="تشغيل/إيقاف"
              >
                ⏯
              </button>
              <button className="ctl" onClick={() => playNext(true)} title="التالي">
                ⏭
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Search + album banner */}
      <section style={{ maxWidth: 960, margin: '20px auto 12px auto', padding: '12px 16px' }}>
        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link
            href="/browse"
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.18)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            اكتب ماتحب ان تسمع في مربع البحث او انقر هنا لتصفّح الأقسام
          </Link>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ماذا تحب أن تسمع؟ اكتب اسم نشيد/منشد/ألبوم..."
            style={{ padding: '14px 16px', border: '2px solid #d1fae5', borderRadius: 12, width: '100%', maxWidth: 680, fontSize: 18 }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={addAllResultsToQueue} className="ctl" title="إضافة النتائج إلى القائمة">
              + أضف النتائج
            </button>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', marginTop: 6 }}>
              <input type="checkbox" checked={showKids} onChange={(e) => setShowKids(e.target.checked)} />
              <span> تضمين أناشيد الأطفال في البحث</span>
            </label>
          </div>
        </div>

        {singleAlbum && (
          <div
            style={{
              maxWidth: 960,
              margin: '14px auto 0',
              padding: '10px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              background: '#fff',
              display: 'flex',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <img
              src={singleAlbum.cover}
              width={48}
              height={48}
              style={{
                borderRadius: 10,
                objectFit: singleAlbum.cover === '/logo.png' ? 'contain' : 'cover',
                background: singleAlbum.cover === '/logo.png' ? '#f3f4f6' : undefined,
                padding: singleAlbum.cover === '/logo.png' ? 6 : undefined,
              }}
              alt=""
              onError={(e) => {
                const t = e.currentTarget as HTMLImageElement;
                if (t.src.endsWith('/logo.png')) return;
                t.onerror = null;
                t.src = '/logo.png';
                t.style.objectFit = 'contain';
                t.style.background = '#f3f4f6';
                t.style.padding = '6px';
              }}
            />
            <div style={{ lineHeight: 1.4 }}>
              <div style={{ fontWeight: 700, color: '#064e3b' }}>ألبوم: {singleAlbum.title}</div>
              <div style={{ fontSize: 12, color: '#047857' }}>{singleAlbum.year ? `السنة: ${singleAlbum.year}` : ''}</div>
              {albumInfo && <div style={{ fontSize: 12, color: '#374151', marginTop: 4, whiteSpace: 'pre-wrap' }}>{albumInfo}</div>}
            </div>
          </div>
        )}

        {err && <div style={{ color: '#dc2626', textAlign: 'center', marginTop: 8 }}>{err}</div>}
      </section>

      {/* Results */}
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '0 16px calc(var(--footerH,160px) + var(--kb,0)) 16px' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((tr) => {
            const baseName = [tr.title, tr.artist || tr.artist_text].filter(Boolean).join(' - ');
            const isCurrent = current && String(current.id) === String(tr.id);
            return (
              <div
                key={String(tr.id)}
                ref={(el) => {
                  resultRefs.current[String(tr.id)] = el;
                }}
                className="trackCard"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'stretch',
                  flexWrap: 'wrap',
                  gap: 8,
                  border: '1px solid ' + (isCurrent ? '#a7f3d0' : '#e5e7eb'),
                  borderRadius: 12,
                  padding: 12,
                  background: isCurrent ? '#ecfdf5' : '#fff',
                }}
              >
                <div className="trackRow" style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12, minWidth: 0, flex: 1 }}>
                  <img
                    loading="lazy"
                    src={tr.cover_url || '/logo.png'}
                    width={54}
                    height={54}
                    style={{
                      objectFit: tr.cover_url ? 'cover' : 'contain',
                      borderRadius: 10,
                      flex: '0 0 54px',
                      background: tr.cover_url ? undefined : '#f3f4f6',
                      padding: tr.cover_url ? undefined : '6px',
                    }}
                    alt=""
                    onError={(e) => {
                      const t = e.currentTarget as HTMLImageElement;
                      if (t.src.endsWith('/logo.png')) return;
                      t.onerror = null;
                      t.src = '/logo.png';
                      t.style.objectFit = 'contain';
                      t.style.background = '#f3f4f6';
                      t.style.padding = '6px';
                    }}
                  />
                  <div className="trackMeta" style={{ minWidth: 0, flex: 1 }}>
                    <div
                      className="trackTitle two"
                      title={tr.title}
                      onClick={() => playNow(tr)}
                      style={{ color: '#064e3b', fontWeight: 700, lineHeight: 1.35, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                    >
                      {isCurrent && <span aria-hidden>▶</span>}
                      <span style={{ display: 'inline' }}>{tr.title}</span>
                      {lyricsMap[String(tr.id)] || tr.has_lyrics ? (
                        <button
                          className="lyricsIcon"
                          title="كلمات"
                          onClick={(e) => {
                            e.stopPropagation();
                            openLyrics(tr);
                          }}
                        >
                          🎼
                        </button>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '6px 0' }}>
                      {tr.class_parent && (
                        <span role="button" onClick={() => setQ(tr.class_parent || '')} className="chip">
                          {tr.class_parent}
                        </span>
                      )}
                      {tr.class_child && (
                        <span role="button" onClick={() => setQ(tr.class_child || '')} className="chip">
                          {tr.class_child}
                        </span>
                      )}
                    </div>
                    <div className="trackSub" style={{ fontSize: 13, color: '#047857', lineHeight: 1.35 }}>
                      {tr.album ? (
                        <span role="button" onClick={() => setQ(tr.album || '')} className="linkish">
                          الألبوم: {tr.album}
                        </span>
                      ) : (
                        '—'
                      )}
                      {tr.year ? <span> • {tr.year}</span> : null}
                      <br />
                      {tr.artist || tr.artist_text ? (
                        <span role="button" onClick={() => setQ(tr.artist || tr.artist_text || '')} className="linkish">
                          المنشد: {tr.artist || tr.artist_text}
                        </span>
                      ) : (
                        <span style={{ color: '#6b7280' }}>—</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    className="ctl"
                    title="مشاركة"
                    onClick={() => {
                      try {
                        const origin = typeof window !== 'undefined' ? window.location.origin : 'https://play.nashidona.net';
                        const url = `${origin}/t/${tr.id}`;
                        if (navigator.share) {
                          navigator.share({ url }).catch(() => {});
                        } else {
                          navigator.clipboard?.writeText(url);
                          alert('تم نسخ رابط المشاركة');
                        }
                      } catch {}
                    }}
                  >
                    🔗
                  </button>
                  <a href={`/api/d/${tr.id}/${encodeURIComponent(baseName)}.mp3`} className="ctl" download title="تنزيل">
                    ⬇
                  </a>
                  <button className="ctl" onClick={() => addToQueue(tr)} title="إضافة للقائمة">
                    ＋
                  </button>
                  <button className="ctl" onClick={() => playNow(tr)} title="تشغيل">
                    ▶
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div ref={sentinelRef} style={{ height: 1 }} />
      </main>

      {/* Footer player */}
      <footer
        ref={footerRef}
        style={{
          position: 'fixed',
          bottom: 'var(--kb,0)',
          left: 0,
          right: 0,
          background: '#ffffffee',
          backdropFilter: 'blur(8px)',
          borderTop: '1px solid #e5e7eb',
          zIndex: 40,
        }}
      >
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="ctl" onClick={() => playPrev(true)} title="السابق">
              ⏮
            </button>
            <button className="ctl" onClick={() => skipBy(-10)} title="-10ث">
              ⏪10
            </button>
            <button
              className="ctl"
              onClick={() => {
                const a = audioRef.current;
                if (!a) return;
                if (a.paused) a.play();
                else a.pause();
              }}
              title="تشغيل/إيقاف"
            >
              ⏯
            </button>
            <button className="ctl" onClick={() => skipBy(10)} title="+10ث">
              10⏩
            </button>
            <button className="ctl" onClick={() => playNext(true)} title="التالي">
              ⏭
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220 }}>
            <span style={{ width: 42, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{fmt(t)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(1, dur)}
              step={1}
              value={Math.min(t, dur || 0)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                const a = audioRef.current;
                if (a) a.currentTime = v;
                setT(v);
              }}
              style={{ flex: 1, height: 8 }}
            />
            <span style={{ width: 42, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(dur)}</span>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              className="ctl"
              onClick={() => setLoop((l) => (l === 'none' ? 'queue' : l === 'queue' ? 'one' : 'none'))}
              title={`نمط التكرار: ${loop === 'none' ? 'بدون' : loop === 'queue' ? 'القائمة' : 'المسار'}`}
            >
              {loop === 'none' ? '⏹' : loop === 'queue' ? '🔁' : '🔂'}
            </button>
            <button className="ctl" onClick={shuffleQueue} title="خلط القائمة">
              🔀
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="مستوى الصوت">
              <span>🔊</span>
              <input type="range" min={0} max={1} step={0.01} value={vol} onChange={(e) => setVol(parseFloat(e.target.value))} />
            </div>
            <select
              onChange={(e) => {
                const m = parseInt(e.target.value, 10);
                if (m > 0) startSleep(m);
              }}
              defaultValue="0"
              title="مؤقّت النوم"
            >
              <option value="0">بدون مؤقّت</option>
              <option value="15">15د</option>
              <option value="30">30د</option>
              <option value="60">60د</option>
            </select>
          </div>

          <button className="ctl" onClick={() => setOpen(true)} onTouchEnd={() => setOpen(true)} aria-expanded={open} title="فتح القائمة">
            قائمة ({queue.length})
          </button>
          <audio ref={audioRef} src={current ? `/api/stream/${current.id}` : undefined} preload="metadata" />
        </div>
      </footer>

      {/* باقي الـ UI (قائمة التشغيل، كلمات، feedback) كما عندك — بدون تغيير */}
      {/* ... (نفس كودك تماماً) ... */}

      <style jsx global>{`
        *,*::before,*::after{ box-sizing:border-box }
        html,body{ max-width:100%; overflow-x:hidden; margin:0 }
        img,video,canvas{ max-width:100%; height:auto; display:block }
        footer{ left:0; right:0; transform:translateZ(0) }

        .chip{ font-size:12px; padding:4px 8px; border:1px solid #d1fae5; border-radius:999px; background:#f0fdf4; color:#065f46; cursor:pointer; }
        .chip:hover{ background:#dcfce7 }
        .linkish{ cursor:pointer; text-decoration:underline; text-underline-offset:3px }

        .trackCard { width:100%; }
        .trackCard > * { min-width:0; }
        .trackRow > * { min-width:0; }
        .lyricsIcon { border:1px solid #e5e7eb; border-radius:6px; padding:2px 6px; font-size:12px; background:#fff; cursor:pointer; }

        .ctl { min-width:44px; min-height:44px; padding:8px 10px; font-size:18px; border:1px solid #e5e7eb; border-radius:10px; background:#fff; }
        .ctl:hover { background:#f8fafc; }
        .ctl:active { transform: scale(.98); }

        .two{
          display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2;
          overflow:hidden; text-overflow:ellipsis; white-space:normal;
        }

        .fbBtn { padding:4px 8px; border:1px solid #e5e7eb; background:#fff; border-radius:8px; font-size:12px; }
        .fbFab { position: fixed; left: 12px; bottom: calc(var(--kb,0) + var(--footerH,160px) + 12px); z-index: 50; border:1px solid #e5e7eb; background:#fff; width:42px; height:42px; border-radius:999px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(0,0,0,.12); }

        @media (max-width: 520px) {
          .trackCard { flex-direction: column; align-items: stretch; width:100%; }
          .actions { width:100%; display:grid !important; grid-template-columns: repeat(4, auto); gap:8px; align-items:center; justify-content:flex-start; }
          header .stats { display:none; }
        }

        .sheet{ position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,.25); }
        .sheet .panel{ position: absolute; left:0; right:0; bottom:0; background:#fff; border-top-left-radius:16px; border-top-right-radius:16px; padding: 10px; box-shadow:0 -10px 30px rgba(0,0,0,.15); padding-bottom: calc(10px + env(safe-area-inset-bottom)); }
        .sheet .handle{ width:44px; height:5px; background:#e5e7eb; border-radius:999px; margin:6px auto 10px; }
      `}</style>
    </div>
  );
}
