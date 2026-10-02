-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- The server reads and writes these tables with the service role key. Row level security is on with
-- no policies, so the public (anon) key that ships to browsers cannot read or change anything.

create table if not exists personalities (
  id text primary key,
  owner_id text not null,
  share_token text unique,
  updated_at bigint not null default 0,
  data jsonb not null
);
create index if not exists personalities_owner_idx on personalities (owner_id, updated_at desc);

create table if not exists conversations (
  id text primary key,
  visible_to text,
  updated_at bigint not null default 0,
  data jsonb not null
);
create index if not exists conversations_visible_idx on conversations (visible_to, updated_at desc);

alter table personalities enable row level security;
alter table conversations enable row level security;
