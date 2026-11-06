-- CHLOÉ & MARIN — SUPABASE
-- À exécuter dans Supabase > SQL Editor.
-- Ne mettez JAMAIS une service_role key dans le frontend.

create extension if not exists pgcrypto;

create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  invite_code text not null unique,
  max_guests integer not null default 1 check (max_guests between 1 and 20),
  created_at timestamptz not null default now()
);

create table if not exists public.rsvps (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null unique references public.guests(id) on delete cascade,
  attendance text not null check (attendance in ('yes','no')),
  people_count integer not null default 0 check (people_count >= 0 and people_count <= 20),
  companions text,
  diet text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guest_photos (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete cascade,
  storage_path text not null unique,
  original_name text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists guest_photos_guest_id_idx
  on public.guest_photos(guest_id);

alter table public.guests enable row level security;
alter table public.rsvps enable row level security;
alter table public.guest_photos enable row level security;

-- Pour la V1, les écritures de RSVP et de photos doivent passer
-- par des Edge Functions qui valident l'invitation.
-- Ne créez pas de policy publique "insert/update" sans validation.

-- Bucket à créer dans Storage :
-- wedding-photos
--
-- Dans une mise en production, les policies Storage doivent être
-- restreintes aux chemins guest/<guest_id>/...
