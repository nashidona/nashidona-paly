import React, { useEffect, useRef, useState } from 'react';

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
  has_lyrics?: boolean;
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

  // مراجع
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayPending = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  loadingRef.current = loading;

  // مراقبة التعليق/العطب
  const lastProgressRef = useRef<number>(0);
  const retryRef = useRef<number>(0);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const MAX_RETRIES = 2;
  const STUCK_MS = 15000;
  const CHECK_EVERY = 4000;

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
      const r = await fetch(`/api/search?q=${encodeURIComponent(dq)}&limit=60&offset=${newOffset}`);
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
          const r = await fetch(`/api/random?limit=60`);
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
          const r2 = await fetch(`/api/search?q=&limit=1&offset=0`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  // تحضير توفر الكلمات
  useEffect(() => {
    if (!items.length) return;
    const sample = items.slice(0, 36).filter((it) => lyricsMap[String(it.id)] === undefined);
    if (!sample.length) return;
    (async () => {
      for (const it of sample) {
        try {
          const r = await fetch(`/api/track?id=${it.id}`);
          const j = await r.json();
          const has = !!(j?.lyrics && String(j.lyrics).trim());
          if (has) setLyricsMap((m) => ({ ...m, [String(it.id)]: true }));
        } catch {}
      }
    })();
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
    } catch {}
    setHydrated(true);
  }, []);

  // وظائف التشغيل
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
  function move(id: Track['id'], dir: -1 | 1) {
    setQueue((q) => {
      const i = q.findIndex((x) => String(x.id) === String(id));
      if (i < 0) return q;
      const j = i + dir;
      if (j < 0 || j >= q.length) return q;
      const c = [...q];
      const tmp = c[i];
      c[i] = c[j];
      c[j] = tmp;
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
  function seek(v: number) {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = v;
    setT(v);
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
    const onStalled = () => {
      /* handled by watchdog */
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
    a.addEventListener('stalled', onStalled);
    a.addEventListener('abort', onAbort);

    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('error', onError);
      a.removeEventListener('stalled', onStalled);
      a.removeEventListener('abort', onAbort);
      stopWatchdog();
    };
  }, [current, queue, loop, sleepAt]);

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

  function startSleep(minutes: number) {
    const when = Date.now() + minutes * 60 * 1000;
    setSleepAt(when);
  }

  // إضافة كل النتائج إلى القائمة
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
    const cap = Math.min(total, 200);
    if (cap <= 0) return;
    if (cap > items.length && cap > 120) {
      if (!confirm(`سيتم إضافة حتى ${cap} أنشودة إلى القائمة. هل أنت متأكد؟`)) return;
    }

    let all = [...items];
    let nextOffset = items.length;
    const maxLoops = 50;
    for (let loop = 0; all.length < cap && loop < maxLoops; loop++) {
      const r = await fetch(`/api/search?q=${encodeURIComponent(dq)}&limit=60&offset=${nextOffset}`);
      if (!r.ok) break;
      const j = await r.json();
      const page: Track[] = Array.isArray(j.items) ? j.items : [];
      if (!page.length) break;
      all = dedup([...all, ...page]);
      nextOffset += 60;
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

  // فتح كلمات
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

  // بانر معلومات الألبوم
  const singleAlbum = (() => {
    if (!items.length) return null;
    const uniq = Array.from(new Set(items.map((x) => x.album || '')));
    if (uniq.length === 1 && uniq[0]) {
      const sample = items[0];
      return { title: uniq[0], year: sample.year || '', cover: sample.cover_url || '/logo.png' };
    }
    return null;
  })();

  // جلب info للألبوم
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

  // تشغيل فوري عند فتح رابط المشاركة /?play=ID
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const u = new URL(window.location.href);
      const pid = u.searchParams.get('play');
      if (!pid || !/^\d+$/.test(pid)) return;
      (async () => {
        try {
          const r = await fetch('/api/track?id=' + pid + '&full=1', { headers: { accept: 'application/json' }, cache: 'no-store' });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <div
              style={{
                maxWidth: 960,
                margin: '0 auto',
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
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
                {(current.artist || current.artist_text) && (
                  <div style={{ fontSize: 12, color: '#4b5563' }}>{current.artist || current.artist_text}</div>
                )}
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
            return (
              <div
                key={String(tr.id)}
                className="trackCard"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'stretch',
                  flexWrap: 'wrap',
                  gap: 8,
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: 12,
                  background: '#fff',
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
                      <span style={{ display: 'inline' }}>{tr.title}</span>
                      {(lyricsMap[String(tr.id)] || tr.has_lyrics) && (
                        <button className="lyricsIcon" title="كلمات" onClick={(e) => { e.stopPropagation(); openLyrics(tr); }}>
                          🎼
                        </button>
                      )}
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
                        <span role="button" onClick={() => setQ((tr.artist || tr.artist_text) || '')} className="linkish">
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
        style={{ position: 'fixed', bottom: 'var(--kb,0)', left: 0, right: 0, background: '#ffffffee', backdropFilter: 'blur(8px)', borderTop: '1px solid #e5e7eb', zIndex: 40 }}
      >
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="ctl" onClick={() => playPrev(true)} title="السابق">
              ⏮
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
            <button className="ctl" onClick={() => playNext(true)} title="التالي">
              ⏭
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220 }}>
            <span style={{ width: 42, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{fmt(t)}</span>
            <input type="range" min={0} max={Math.max(1, dur)} step={1} value={Math.min(t, dur || 0)} onChange={(e) => { const v = parseFloat(e.target.value); const a = audioRef.current; if (a) { a.currentTime = v; } setT(v); }} style={{ flex: 1 }} />
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
            <select onChange={(e) => { const m = parseInt(e.target.value, 10); if (m > 0) startSleep(m); }} defaultValue="0" title="مؤقّت النوم">
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

      {/* قائمة التشغيل */}
      {open && (
        <div className="sheet" onClick={() => setOpen(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <div className="handle" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
              <b>قائمة التشغيل</b>
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
                <select onChange={(e) => { const m = parseInt(e.target.value, 10); if (m > 0) startSleep(m); }} defaultValue="0" title="مؤقّت النوم">
                  <option value="0">بدون مؤقّت</option>
                  <option value="15">15د</option>
                  <option value="30">30د</option>
                  <option value="60">60د</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, marginInlineStart: 'auto' }}>
                <button className="ctl" onClick={() => setOpen(false)}>إغلاق</button>
                <button className="ctl" onClick={clearQueue} disabled={!queue.length}>
                  تفريغ الكل
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, maxHeight: '56vh', overflowY: 'auto' }}>
              {queue.map((tr, i) => (
                <div
                  key={String(tr.id)}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(i)); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
                    const to = i;
                    setQueue((q) => {
                      const c = [...q];
                      const [it] = c.splice(from, 1);
                      c.splice(to, 0, it);
                      return c;
                    });
                  }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    alignItems: 'center',
                    gap: 8,
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    padding: '8px 10px',
                    background: current && String(current.id) === String(tr.id) ? '#ecfdf5' : '#fff',
                  }}
                >
                  {/* العنوان قابل للنقر للتشغيل — سطران */}
                  <div
                    className="two"
                    title={tr.title}
                    onClick={() => playNow(tr)}
                    style={{ cursor: 'pointer', minWidth: 0 }}
                  >
                    {tr.title}
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="ctl" onClick={() => move(tr.id, -1)} disabled={i === 0} title="أعلى">
                      ⬆
                    </button>
                    <button className="ctl" onClick={() => move(tr.id, +1)} disabled={i === queue.length - 1} title="أسفل">
                      ⬇
                    </button>
                    <button className="ctl" onClick={() => removeFromQueue(tr.id)} title="حذف">
                      ✕
                    </button>
                    <button className="ctl" onClick={() => playNow(tr)} title="تشغيل">
                      ▶
                    </button>
                  </div>
                </div>
              ))}
              {!queue.length && <div style={{ color: '#6b7280' }}>لا يوجد عناصر بعد. أضف من النتائج أعلاه.</div>}
            </div>
          </div>
        </div>
      )}

      {/* لوحة كلمات النشيد */}
      {showLyrics.open && (
        <div className="sheet" onClick={() => setShowLyrics({ open: false })}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <div className="handle" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <b>كلمات: {showLyrics.title || ''}</b>
              <button className="ctl" onClick={() => setShowLyrics({ open: false })}>إغلاق</button>
            </div>
            <div style={{ maxHeight: '56vh', overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              {showLyrics.text || '—'}
            </div>
          </div>
        </div>
      )}

      {/* زر تشغيل عند منع التشغيل التلقائي */}
      {needsTap && (
        <div className="sheet" onClick={() => {}} style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="panel" style={{ textAlign: 'center' }}>
            <div className="handle" />
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{incomingTrack?.title || current?.title || 'أنشودة'}</div>
            {(incomingTrack?.artist || incomingTrack?.artist_text || current?.artist || current?.artist_text) && (
              <div style={{ color: '#374151', fontSize: 13, marginBottom: 10 }}>
                {incomingTrack?.artist || incomingTrack?.artist_text || current?.artist || current?.artist_text}
              </div>
            )}
            <div style={{ color: '#374151', fontSize: 14, marginBottom: 12 }}>اضغط الزر للتشغيل</div>
            <button
              className="ctl"
              onClick={() => {
                if (incomingTrack) playNow(incomingTrack);
                audioRef.current?.play().catch(() => {});
                setNeedsTap(false);
              }}
            >
              ▶ اضغط للتشغيل
            </button>
          </div>
        </div>
      )}

      <button className="fbFab" onClick={() => setFbOpen(true)} title="أرسل ملاحظة">
        💬
      </button>

      {fbOpen && (
        <div className="sheet" onClick={() => setFbOpen(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <div className="handle" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <b>إرسال ملاحظة</b>
              <button className="ctl" onClick={() => setFbOpen(false)}>إغلاق</button>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <textarea value={fbMsg} onChange={(e) => setFbMsg(e.target.value)} rows={5} placeholder="اكتب ملاحظتك أو المشكلة التي واجهتك..." style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }} />
              <input value={fbEmail} onChange={(e) => setFbEmail(e.target.value)} placeholder="بريدك (اختياري)" style={{ padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }} />
              <button disabled={fbBusy} onClick={submitFeedback} className="ctl">
                {fbBusy ? 'جارٍ الإرسال...' : 'إرسال'}
              </button>
              {fbOk && <div style={{ fontSize: 13, color: '#065f46' }}>{fbOk}</div>}
              <div style={{ fontSize: 12, color: '#6b7280' }}>سيتم إرفاق بعض المعلومات التقنية (نوع الجهاز/المتصفح، الصفحة الحالية، والمعرّف إن كانت هناك أنشودة قيد التشغيل) لمساعدتنا في التشخيص.</div>
            </div>
          </div>
        </div>
      )}

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

        /* زر تحكم كبير للمس */
        .ctl { min-width:44px; min-height:44px; padding:8px 10px; font-size:18px; border:1px solid #e5e7eb; border-radius:10px; background:#fff; }
        .ctl:hover { background:#f8fafc; }
        .ctl:active { transform: scale(.98); }

        /* عنوان على سطرين كحدّ أقصى */
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
