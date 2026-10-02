-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
-- The app's API routes use the service role key. Row level security is on with no policies,
-- so the public (anon) key that ships to browsers cannot read or change anything.

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

-- One row per message, for the per-IP message limit (serverless instances share no memory).
create table if not exists rate_events (
  ip text not null,
  at bigint not null
);
create index if not exists rate_events_ip_idx on rate_events (ip, at);

alter table personalities enable row level security;
alter table conversations enable row level security;
alter table rate_events enable row level security;
