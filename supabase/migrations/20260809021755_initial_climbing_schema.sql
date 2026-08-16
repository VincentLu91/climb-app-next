-- ============================================================
-- PROFILES
-- One row per authenticated user.
-- Shared by Next.js and Expo.
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  display_name text,

  height_cm numeric,
  experience_level text,
  typical_grade text,
  climbing_style text[],
  goals text[],
  weaknesses text[],

  onboarding_version integer not null default 0,
  onboarded_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ============================================================
-- UPLOADS
-- Photos or videos submitted by a user for climbing analysis.
-- ============================================================

create table public.uploads (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  media_path text not null,

  media_type text not null
    check (media_type in ('image', 'video')),

  grade text,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ============================================================
-- ANALYSES
-- AI analysis generated from an uploaded photo/video.
-- ============================================================

create table public.analyses (
  id uuid primary key default gen_random_uuid(),

  upload_id uuid not null
    references public.uploads(id)
    on delete cascade,

  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),

  result text,
  error_message text,

  model_provider text,
  model_name text,

  profile_snapshot jsonb,

  created_at timestamptz not null default now(),
  completed_at timestamptz
);