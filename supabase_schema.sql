-- Chloé & Marin — V3
-- La liste des invités reste dans Google Sheets.
-- Supabase stocke uniquement les RSVP et les photos.

create extension if not exists pgcrypto;

create table if not exists public.rsvps (
  id uuid primary key default gen_random_uuid(),
  invite_code text primary key,
  attendance text not null check (attendance in ('yes','no')),
  people_count integer not null default 0 check (people_count >= 0),
  companions text not null default '',
  diet text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guest_photos (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now()
);

alter table public.rsvps enable row level security;
alter table public.guest_photos enable row level security;

-- Les écritures/lectures passent par les Edge Functions avec la clé service_role.
-- Aucune policy publique n’est créée volontairement.

insert into storage.buckets (id, name, public)
values ('wedding-photos', 'wedding-photos', false)
on conflict (id) do nothing;
