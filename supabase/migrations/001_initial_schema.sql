-- ============================================================
-- Nexus Ops Hub — Schema inicial
-- Execute no Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Extensão para UUIDs
create extension if not exists "pgcrypto";

-- ============================================================
-- TABELA: ig_credentials
-- Armazena o token de acesso do Instagram com rastreamento
-- de expiração para renovação automática.
-- Apenas uma linha por conta (upsert por account_id).
-- ============================================================
create table if not exists ig_credentials (
  id                uuid        primary key default gen_random_uuid(),
  account_id        text        not null unique,          -- ID numérico da conta Business
  username          text        not null,                  -- @username (sem @)
  access_token      text        not null,                  -- Token long-lived
  token_expires_at  timestamptz not null,                  -- Data de expiração (token dura 60 dias)
  token_issued_at   timestamptz not null default now(),    -- Quando foi emitido/renovado
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Trigger: atualiza updated_at automaticamente
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger ig_credentials_updated_at
  before update on ig_credentials
  for each row execute function set_updated_at();

-- ============================================================
-- TABELA: ig_snapshots
-- Snapshot diário dos KPIs da conta Instagram.
-- Permite histórico para comparativos mês-a-mês, trends, etc.
-- Uma linha por (account_id, date) — upsert idempotente.
-- ============================================================
create table if not exists ig_snapshots (
  id                   uuid    primary key default gen_random_uuid(),
  account_id           text    not null,
  snapshot_date        date    not null,                 -- Data do snapshot (UTC)
  followers_count      integer not null default 0,
  following_count      integer not null default 0,
  media_count          integer not null default 0,
  -- Métricas do período (últimos 30 dias até a data do snapshot)
  total_reach          integer not null default 0,
  total_impressions    integer not null default 0,
  avg_engagement_rate  numeric(5,2) not null default 0,
  post_count           integer not null default 0,        -- Posts no período
  created_at           timestamptz not null default now(),

  unique (account_id, snapshot_date)
);

create index if not exists ig_snapshots_account_date
  on ig_snapshots (account_id, snapshot_date desc);

-- ============================================================
-- TABELA: ig_posts_cache
-- Cache dos posts e suas métricas.
-- Evita chamadas repetidas à API para dados já conhecidos.
-- TTL: 24h (a aplicação verifica cached_at antes de usar).
-- ============================================================
create table if not exists ig_posts_cache (
  id                  uuid    primary key default gen_random_uuid(),
  instagram_post_id   text    not null unique,           -- ID original do post no Instagram
  account_id          text    not null,
  media_type          text    not null,                  -- IMAGE | VIDEO | REEL | CAROUSEL_ALBUM
  caption             text,
  thumbnail_url       text,
  media_url           text,
  permalink           text,
  post_timestamp      timestamptz,                       -- Quando o post foi publicado
  like_count          integer not null default 0,
  comments_count      integer not null default 0,
  reach               integer not null default 0,
  impressions         integer not null default 0,
  saves               integer not null default 0,
  shares              integer not null default 0,
  video_views         integer not null default 0,
  engagement_rate     numeric(5,2) not null default 0,
  cached_at           timestamptz not null default now() -- Para TTL: invalida após 24h
);

create index if not exists ig_posts_cache_account
  on ig_posts_cache (account_id, post_timestamp desc);

create index if not exists ig_posts_cache_ttl
  on ig_posts_cache (cached_at);

-- ============================================================
-- ROW LEVEL SECURITY (OWASP A01 — Broken Access Control)
-- Bloqueia acesso direto via anon key.
-- As Netlify Functions usam a service_role key, que bypassa RLS
-- por design — mas mesmo assim habilitamos para proteger contra
-- qualquer vazamento da anon key.
-- ============================================================
alter table ig_credentials   enable row level security;
alter table ig_snapshots     enable row level security;
alter table ig_posts_cache   enable row level security;

-- Nenhuma policy para anon — acesso zero via anon key
-- (service_role key bypassa RLS e é usada apenas pelo servidor)

-- ============================================================
-- FUNÇÃO: cleanup_expired_cache
-- Remove posts do cache com mais de 24h.
-- Chamada pelo scheduled task semanal.
-- ============================================================
create or replace function cleanup_expired_cache()
returns void as $$
begin
  delete from ig_posts_cache
  where cached_at < now() - interval '24 hours';
end;
$$ language plpgsql security definer;

-- ============================================================
-- VIEW: ig_snapshots_monthly
-- Agrega snapshots por mês para comparativos.
-- ============================================================
create or replace view ig_snapshots_monthly as
select
  account_id,
  date_trunc('month', snapshot_date)::date  as month,
  round(avg(followers_count))               as avg_followers,
  max(followers_count)                      as max_followers,
  sum(total_reach)                          as total_reach,
  sum(total_impressions)                    as total_impressions,
  round(avg(avg_engagement_rate)::numeric, 2) as avg_engagement_rate,
  sum(post_count)                           as total_posts,
  count(*)                                  as snapshot_days
from ig_snapshots
group by account_id, date_trunc('month', snapshot_date)::date
order by account_id, month desc;
