-- Run this in your Supabase SQL Editor.
-- Creates two tables: `clients` (white-label brands) and `analyses` (GEM results + per-client copy).

-- =========================================
-- CLIENTS: white-label brands managed by the team
-- =========================================
create table if not exists public.clients (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  business_name   text not null,
  location        text,
  vertical        text,
  tone_voice      text,
  notes           text,
  archived        boolean not null default false,
  created_by_email text
);

create index if not exists clients_business_name_idx
  on public.clients (business_name);
create index if not exists clients_archived_idx
  on public.clients (archived);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- =========================================
-- ANALYSES: one row per video, with an array of per-client copy generations
-- =========================================
create table if not exists public.analyses (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  source           text not null check (source in ('youtube', 'upload')),
  source_label     text not null,
  gem_row          text not null,
  copy_generations jsonb not null default '[]'::jsonb,
  -- copy_generations shape: [
  --   {
  --     id: uuid, client_id: uuid, client_name: string,
  --     model: string, created_at: iso, created_by_email: string,
  --     super_long_form, long_form, medium_form, short_form, ultra_short,
  --     headlines: [string, string, ...]
  --   }
  -- ]
  created_by_id    text,
  created_by_email text,
  usage_metadata   jsonb
);

create index if not exists analyses_created_at_idx
  on public.analyses (created_at desc);

-- RLS is disabled: Netlify Functions use the service_role key and enforce auth
-- via Netlify Identity JWT. If you ever switch to direct client -> Supabase calls,
-- enable RLS and add policies.
