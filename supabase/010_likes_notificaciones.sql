-- Recetario de Javi · likes en comentarios y notificaciones internas
-- Ejecutar una sola vez después de 009_permisos_login_usuario.sql.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- LIKES EN COMENTARIOS
-- ---------------------------------------------------------------------------
create table if not exists public.recipe_comment_likes (
  comment_id uuid not null references public.recipe_comments(id) on delete cascade,
  user_id uuid not null references public.recetario_accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists recipe_comment_likes_user_idx
  on public.recipe_comment_likes(user_id, created_at desc);

create or replace function public.can_access_recipe_comment(target_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.recipe_comments comment
    where comment.id = target_comment_id
      and public.can_access_recipe(comment.recipe_id)
  );
$$;

alter table public.recipe_comment_likes enable row level security;

drop policy if exists "Comment likes are readable" on public.recipe_comment_likes;
create policy "Comment likes are readable"
on public.recipe_comment_likes for select to authenticated
using (public.can_access_recipe_comment(comment_id));

drop policy if exists "Active users like comments" on public.recipe_comment_likes;
create policy "Active users like comments"
on public.recipe_comment_likes for insert to authenticated
with check (
  user_id = auth.uid()
  and public.is_recetario_active()
  and public.can_access_recipe_comment(comment_id)
);

drop policy if exists "Users remove their comment likes" on public.recipe_comment_likes;
create policy "Users remove their comment likes"
on public.recipe_comment_likes for delete to authenticated
using (user_id = auth.uid());

grant select, insert, delete on public.recipe_comment_likes to authenticated;
grant execute on function public.can_access_recipe_comment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- NOTIFICACIONES INTERNAS
-- ---------------------------------------------------------------------------
create table if not exists public.recipe_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.recetario_accounts(id) on delete cascade,
  actor_id uuid references public.recetario_accounts(id) on delete set null,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  comment_id uuid references public.recipe_comments(id) on delete cascade,
  notification_type text not null check (notification_type in ('recipe_comment', 'comment_reply')),
  recipe_title text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists recipe_notifications_user_idx
  on public.recipe_notifications(user_id, is_read, created_at desc);

create or replace function public.create_recipe_comment_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_id uuid;
  target_type text;
  target_recipe_title text;
begin
  select recipe.title, recipe.owner_id
  into target_recipe_title, recipient_id
  from public.recipes recipe
  where recipe.id = new.recipe_id;

  if new.parent_id is not null then
    select parent.author_id
    into recipient_id
    from public.recipe_comments parent
    where parent.id = new.parent_id;
    target_type := 'comment_reply';
  else
    target_type := 'recipe_comment';
  end if;

  -- Nadie necesita una notificación de su propia acción.
  if recipient_id is null or recipient_id = new.author_id then
    return new;
  end if;

  insert into public.recipe_notifications (
    user_id,
    actor_id,
    recipe_id,
    comment_id,
    notification_type,
    recipe_title
  ) values (
    recipient_id,
    new.author_id,
    new.recipe_id,
    new.id,
    target_type,
    coalesce(target_recipe_title, 'Receta')
  );

  return new;
end;
$$;

drop trigger if exists recipe_comments_create_notification on public.recipe_comments;
create trigger recipe_comments_create_notification
after insert on public.recipe_comments
for each row execute function public.create_recipe_comment_notification();

alter table public.recipe_notifications enable row level security;

drop policy if exists "Users read their recipe notifications" on public.recipe_notifications;
create policy "Users read their recipe notifications"
on public.recipe_notifications for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users mark their recipe notifications" on public.recipe_notifications;
create policy "Users mark their recipe notifications"
on public.recipe_notifications for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users delete their recipe notifications" on public.recipe_notifications;
create policy "Users delete their recipe notifications"
on public.recipe_notifications for delete to authenticated
using (user_id = auth.uid());

grant select, delete on public.recipe_notifications to authenticated;
grant update(is_read) on public.recipe_notifications to authenticated;

notify pgrst, 'reload schema';

-- Comprobación visual para el SQL Editor.
select
  to_regclass('public.recipe_comment_likes') is not null as likes_ready,
  to_regclass('public.recipe_notifications') is not null as notifications_ready;
