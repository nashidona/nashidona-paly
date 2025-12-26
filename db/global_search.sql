create extension if not exists unaccent;
create extension if not exists pg_trgm;

create index if not exists idx_tracks_title_trgm on public.tracks using gin (lower(unaccent(title)) gin_trgm_ops);
create index if not exists idx_tracks_year_trgm  on public.tracks using gin (lower(unaccent(year)) gin_trgm_ops);
create index if not exists idx_tracks_lyrics_trgm on public.tracks using gin (lower(unaccent(lyrics)) gin_trgm_ops);
create index if not exists idx_albums_title_trgm on public.albums using gin (lower(unaccent(title)) gin_trgm_ops);
create index if not exists idx_albums_info_trgm  on public.albums using gin (lower(unaccent(info)) gin_trgm_ops);

create or replace function public.f_extract_artist(s text)
returns text language sql immutable as $$
  select coalesce(
    (regexp_matches(coalesce(s,''), '(?:أداء|اداء|المنشد|إنشاد|انشاد)\s*[:：]?\s*([^،\-\(\)\|\n\r]+)'))[1],
    (regexp_matches(coalesce(s,''), '\(([^)]+)\)'))[1]
  );
$$;

create or replace function public.global_search_count(q text)
returns table(count bigint) language sql stable as $$
with base as (
  select t.id, t.title, t.year, t.go_url, t.source_url, t.lyrics, a.title as album, a.info
  from public.tracks t
  left join public.albums a on a.id = t.album_id
  where coalesce(t.title,'') not ilike '%تحميل%'
  and coalesce(t.source_url,'') !~* '\.(zip|rar|7z|tar|gz|bz2)(\?.*)?$'
  and coalesce(t.source_url,'') not ilike '%oazarab.com%'
  and coalesce(t.go_url,'')     not ilike '%oazarab.com%'
), norm as (
  select id,
         lower(unaccent(title))   as ntitle,
         lower(unaccent(coalesce(year,'')))   as nyear,
         lower(unaccent(coalesce(album,'')))  as nalbum,
         lower(unaccent(coalesce(info,'')))   as ninfo,
         lower(unaccent(coalesce(lyrics,''))) as nlyrics
  from base
), qn as (
  select lower(unaccent(coalesce(q,''))) as nq
)
select count(*)::bigint
from norm, qn
where nq = '' or (
  ntitle like '%'||nq||'%'
  or nyear  like '%'||nq||'%'
  or nalbum like '%'||nq||'%'
  or ninfo  like '%'||nq||'%'
  or nlyrics like '%'||nq||'%'
  or lower(unaccent(coalesce(public.f_extract_artist(ninfo), public.f_extract_artist(nalbum)))) like '%'||nq||'%'
);
$$;

create or replace function public.global_search(q text, limit_n int, offset_n int)
returns table(id int, title text, album text, artist text, cover_url text, year text, url text)
language sql stable as $$
with base as (
  select t.id, t.title, t.year, t.go_url, t.source_url, t.lyrics, a.title as album, a.info, a.cover_url
  from public.tracks t
  left join public.albums a on a.id = t.album_id
 where coalesce(t.title,'') not ilike '%تحميل%'
  and coalesce(t.source_url,'') !~* '\.(zip|rar|7z|tar|gz|bz2)(\?.*)?$'
  and coalesce(t.source_url,'') not ilike '%oazarab.com%'
  and coalesce(t.go_url,'')     not ilike '%oazarab.com%'
), norm as (
  select id, title, year, go_url, source_url, lyrics, album, info, cover_url,
         lower(unaccent(title))   as ntitle,
         lower(unaccent(coalesce(year,'')))   as nyear,
         lower(unaccent(coalesce(album,'')))  as nalbum,
         lower(unaccent(coalesce(info,'')))   as ninfo,
         lower(unaccent(coalesce(lyrics,''))) as nlyrics
  from base
), qn as (
  select lower(unaccent(coalesce(q,''))) as nq
), matches as (
  select *
  from norm, qn
  where nq = '' or (
    ntitle like '%'||nq||'%'
    or nyear  like '%'||nq||'%'
    or nalbum like '%'||nq||'%'
    or ninfo  like '%'||nq||'%'
    or nlyrics like '%'||nq||'%'
    or lower(unaccent(coalesce(public.f_extract_artist(ninfo), public.f_extract_artist(nalbum)))) like '%'||nq||'%'
  )
)
select
  id,
  title,
  album,
  coalesce(public.f_extract_artist(info), public.f_extract_artist(album)) as artist,
  cover_url,
  year,
  coalesce(go_url, 'https://nashidona.net/go/?download=song&id='||id::text) as url
from matches
order by id
limit greatest(1, coalesce(limit_n,60))
offset greatest(0, coalesce(offset_n,0));
$$;
