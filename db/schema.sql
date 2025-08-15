create table if not exists classes (id int primary key,name text,type text,parent_id int);
create table if not exists artists (id bigserial primary key,name text unique,notes text,alt_names text);
create table if not exists albums (id int primary key,title text,year text,cover_url text,artist_id int references artists(id),class_id int references classes(id),last_update date);
create table if not exists tracks (id int primary key,title text,album_id int references albums(id),artist_id int references artists(id),year text,track_no text,source_url text,go_id int,go_url text,lyrics text,clicks int default 0,downloads int default 0,created_at date);
create table if not exists assessments (target_kind text,target_id int,stars_sum int,clicks int);
