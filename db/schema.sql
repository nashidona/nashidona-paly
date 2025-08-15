create table if not exists classes (id int primary key, name text, type text, parent_id int);
create table if not exists artists (id bigserial primary key, name text unique, notes text, alt_names text);
create table if not exists albums (
  id int primary key, title text, year text, cover_url text, info text,
  artist_id int, class_id int references classes(id),
  clicks int, last_update bigint, by_user int, last_update_date date
);
create table if not exists tracks (
  id int primary key, title text, album_id int references albums(id), artist_id int,
  year text, track_no text, source_url text, go_id int, go_url text, lyrics text,
  clicks int default 0, downloads int default 0, created_at date, by_user int
);
create table if not exists assessments (target_kind text, target_id int, stars_sum int, clicks int);
create index if not exists idx_tracks_title_lower on tracks (lower(title));
create index if not exists idx_tracks_year on tracks (year);
create index if not exists idx_albums_title_lower on albums (lower(title));
