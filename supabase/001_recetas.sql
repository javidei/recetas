-- Recetario de Javi · esquema inicial para Supabase
-- Ejecutar en el SQL Editor del proyecto actual cuando se active la persistencia real.

create extension if not exists pgcrypto;

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  summary text not null default '',
  category text not null default 'principal' check (category in ('principal', 'entrante', 'postre', 'desayuno')),
  difficulty text not null default 'Fácil' check (difficulty in ('Fácil', 'Media', 'Difícil')),
  servings integer not null default 1 check (servings between 1 and 100),
  prep_minutes integer not null default 0 check (prep_minutes between 0 and 1440),
  cook_minutes integer not null default 0 check (cook_minutes between 0 and 1440),
  rating numeric(2,1) not null default 0 check (rating between 0 and 5),
  emoji text not null default '🍲',
  cover_image_path text,
  notes text not null default '',
  tags text[] not null default '{}',
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipe_ingredients (
  id bigint generated always as identity primary key,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  position integer not null default 0,
  ingredient_text text not null
);

create table if not exists public.recipe_steps (
  id bigint generated always as identity primary key,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  position integer not null default 0,
  instruction text not null
);

create index if not exists recipes_owner_idx on public.recipes(owner_id);
create index if not exists recipes_category_idx on public.recipes(category);
create index if not exists recipe_ingredients_recipe_idx on public.recipe_ingredients(recipe_id, position);
create index if not exists recipe_ingredients_search_idx on public.recipe_ingredients using gin (to_tsvector('spanish', ingredient_text));
create index if not exists recipe_steps_recipe_idx on public.recipe_steps(recipe_id, position);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists recipes_set_updated_at on public.recipes;
create trigger recipes_set_updated_at
before update on public.recipes
for each row execute function public.set_updated_at();

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;

create policy "Public recipes are readable"
on public.recipes for select
using (is_public or auth.uid() = owner_id);

create policy "Owners can create recipes"
on public.recipes for insert
with check (auth.uid() = owner_id);

create policy "Owners can update recipes"
on public.recipes for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "Owners can delete recipes"
on public.recipes for delete
using (auth.uid() = owner_id);

create policy "Ingredients follow recipe access"
on public.recipe_ingredients for select
using (exists (select 1 from public.recipes r where r.id = recipe_id and (r.is_public or r.owner_id = auth.uid())));

create policy "Owners manage ingredients"
on public.recipe_ingredients for all
using (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid()))
with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid()));

create policy "Steps follow recipe access"
on public.recipe_steps for select
using (exists (select 1 from public.recipes r where r.id = recipe_id and (r.is_public or r.owner_id = auth.uid())));

create policy "Owners manage steps"
on public.recipe_steps for all
using (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid()))
with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can read their recipe images"
on storage.objects for select
using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can upload their recipe images"
on storage.objects for insert
with check (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can update their recipe images"
on storage.objects for update
using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their recipe images"
on storage.objects for delete
using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);
