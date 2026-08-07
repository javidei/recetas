-- Recetario de Javi · recetas por defecto integradas en Supabase
-- Ejecutar una sola vez después de 010_likes_notificaciones.sql.
-- Las 6 recetas iniciales pasan a ser registros reales y comentables.

alter table public.recipes
  add column if not exists is_default boolean not null default false;

alter table public.recipes
  add column if not exists default_key text;

create unique index if not exists recipes_default_key_uidx
  on public.recipes(default_key)
  where default_key is not null;

-- Inserta las recetas base usando como propietario técnico al administrador.
-- En la interfaz NO se muestran como recetas del administrador, sino como
-- "Receta por defecto". El propietario técnico solo satisface la FK histórica.
do $$
declare
  admin_user uuid;
begin
  select account.id into admin_user
  from public.recetario_accounts account
  where account.role = 'admin'
  order by account.created_at asc
  limit 1;

  if admin_user is null then
    raise exception 'No existe todavía una cuenta administradora del Recetario.';
  end if;

  insert into public.recipes (
    id, owner_id, title, summary, category, difficulty, servings,
    prep_minutes, cook_minutes, rating, emoji, notes, tags,
    is_public, visibility, family_id, is_default, default_key,
    created_at, updated_at
  ) values
  (
    '11111111-1111-4111-8111-111111111101', admin_user,
    'Pollo al horno con patatas',
    'Un plato sencillo de casa, jugoso y con las patatas bien impregnadas en el asado.',
    'principal', 'Fácil', 4, 15, 55, 4.8, '🍗',
    'Si las patatas son gruesas, hornéalas 10 minutos antes de añadir el pollo.',
    array['pollo','patata','horno','cebolla','recetario-default:pollo-patatas-horno'],
    true, 'public', null, true, 'pollo-patatas-horno',
    '2026-08-06 12:00:00+02', '2026-08-06 12:00:00+02'
  ),
  (
    '11111111-1111-4111-8111-111111111102', admin_user,
    'Macarrones con tomate y atún',
    'La receta rápida para esos días en los que apetece comer bien sin complicarse.',
    'principal', 'Fácil', 2, 5, 18, 4.4, '🍝',
    'Con un poco de queso rallado por encima gana bastante.',
    array['pasta','macarrones','tomate','atún','recetario-default:macarrones-tomate-atun'],
    true, 'public', null, true, 'macarrones-tomate-atun',
    '2026-08-05 12:00:00+02', '2026-08-05 12:00:00+02'
  ),
  (
    '11111111-1111-4111-8111-111111111103', admin_user,
    'Tortilla de patatas',
    'Clásica, jugosa por dentro y con la cebolla bien pochada.',
    'principal', 'Media', 4, 15, 28, 4.9, '🥔',
    'Dejar reposar la mezcla dos minutos antes de cuajar ayuda a que quede más ligada.',
    array['patata','huevo','cebolla','tortilla','recetario-default:tortilla-patatas'],
    true, 'public', null, true, 'tortilla-patatas',
    '2026-08-04 12:00:00+02', '2026-08-04 12:00:00+02'
  ),
  (
    '11111111-1111-4111-8111-111111111104', admin_user,
    'Ensalada de pollo y yogur',
    'Fresca, completa y ligera, con una salsa rápida de yogur y limón.',
    'entrante', 'Fácil', 2, 15, 10, 4.3, '🥗',
    'También queda bien con manzana cortada fina o unas nueces.',
    array['pollo','ensalada','yogur','tomate','recetario-default:ensalada-pollo-yogur'],
    true, 'public', null, true, 'ensalada-pollo-yogur',
    '2026-08-03 12:00:00+02', '2026-08-03 12:00:00+02'
  ),
  (
    '11111111-1111-4111-8111-111111111105', admin_user,
    'Tostadas de ajo y tomate',
    'Un desayuno salado, crujiente y con mucho sabor en menos de diez minutos.',
    'desayuno', 'Fácil', 1, 4, 4, 4.5, '🍞',
    'Usa poco ajo si lo vas a tomar a primera hora.',
    array['pan','tomate','ajo','desayuno','recetario-default:tostadas-ajo-tomate'],
    true, 'public', null, true, 'tostadas-ajo-tomate',
    '2026-08-02 12:00:00+02', '2026-08-02 12:00:00+02'
  ),
  (
    '11111111-1111-4111-8111-111111111106', admin_user,
    'Bizcocho de yogur',
    'El bizcocho de siempre usando el vasito de yogur como medida.',
    'postre', 'Fácil', 8, 15, 35, 4.7, '🍰',
    'No abras el horno durante los primeros 25 minutos.',
    array['bizcocho','yogur','huevo','postre','recetario-default:bizcocho-yogur'],
    true, 'public', null, true, 'bizcocho-yogur',
    '2026-08-01 12:00:00+02', '2026-08-01 12:00:00+02'
  )
  on conflict (id) do nothing;
end;
$$;

-- Al ser IDs fijos, la carga de ingredientes/pasos es idempotente.
delete from public.recipe_ingredients
where recipe_id in (
  '11111111-1111-4111-8111-111111111101',
  '11111111-1111-4111-8111-111111111102',
  '11111111-1111-4111-8111-111111111103',
  '11111111-1111-4111-8111-111111111104',
  '11111111-1111-4111-8111-111111111105',
  '11111111-1111-4111-8111-111111111106'
);

delete from public.recipe_steps
where recipe_id in (
  '11111111-1111-4111-8111-111111111101',
  '11111111-1111-4111-8111-111111111102',
  '11111111-1111-4111-8111-111111111103',
  '11111111-1111-4111-8111-111111111104',
  '11111111-1111-4111-8111-111111111105',
  '11111111-1111-4111-8111-111111111106'
);

insert into public.recipe_ingredients (recipe_id, position, ingredient_text) values
('11111111-1111-4111-8111-111111111101',0,'4 muslos de pollo'),
('11111111-1111-4111-8111-111111111101',1,'4 patatas medianas'),
('11111111-1111-4111-8111-111111111101',2,'1 cebolla'),
('11111111-1111-4111-8111-111111111101',3,'3 dientes de ajo'),
('11111111-1111-4111-8111-111111111101',4,'150 ml de vino blanco'),
('11111111-1111-4111-8111-111111111101',5,'Aceite de oliva, sal, pimienta y tomillo'),
('11111111-1111-4111-8111-111111111102',0,'180 g de macarrones'),
('11111111-1111-4111-8111-111111111102',1,'200 g de tomate triturado'),
('11111111-1111-4111-8111-111111111102',2,'2 latas de atún'),
('11111111-1111-4111-8111-111111111102',3,'Media cebolla'),
('11111111-1111-4111-8111-111111111102',4,'Orégano'),
('11111111-1111-4111-8111-111111111102',5,'Sal y aceite de oliva'),
('11111111-1111-4111-8111-111111111103',0,'600 g de patatas'),
('11111111-1111-4111-8111-111111111103',1,'5 huevos'),
('11111111-1111-4111-8111-111111111103',2,'1 cebolla'),
('11111111-1111-4111-8111-111111111103',3,'Aceite de oliva'),
('11111111-1111-4111-8111-111111111103',4,'Sal'),
('11111111-1111-4111-8111-111111111104',0,'250 g de pechuga de pollo'),
('11111111-1111-4111-8111-111111111104',1,'Mezcla de hojas verdes'),
('11111111-1111-4111-8111-111111111104',2,'1 tomate'),
('11111111-1111-4111-8111-111111111104',3,'1 yogur natural'),
('11111111-1111-4111-8111-111111111104',4,'Zumo de medio limón'),
('11111111-1111-4111-8111-111111111104',5,'Sal, pimienta y ajo en polvo'),
('11111111-1111-4111-8111-111111111105',0,'2 rebanadas de pan'),
('11111111-1111-4111-8111-111111111105',1,'1 tomate maduro'),
('11111111-1111-4111-8111-111111111105',2,'Medio diente de ajo'),
('11111111-1111-4111-8111-111111111105',3,'Aceite de oliva'),
('11111111-1111-4111-8111-111111111105',4,'Sal'),
('11111111-1111-4111-8111-111111111106',0,'1 yogur natural'),
('11111111-1111-4111-8111-111111111106',1,'3 huevos'),
('11111111-1111-4111-8111-111111111106',2,'2 medidas de azúcar'),
('11111111-1111-4111-8111-111111111106',3,'3 medidas de harina'),
('11111111-1111-4111-8111-111111111106',4,'1 medida de aceite suave'),
('11111111-1111-4111-8111-111111111106',5,'1 sobre de levadura'),
('11111111-1111-4111-8111-111111111106',6,'Ralladura de limón');

insert into public.recipe_steps (recipe_id, position, instruction) values
('11111111-1111-4111-8111-111111111101',0,'Precalienta el horno a 200 °C.'),
('11111111-1111-4111-8111-111111111101',1,'Corta las patatas y la cebolla en rodajas y colócalas en la bandeja.'),
('11111111-1111-4111-8111-111111111101',2,'Añade el pollo salpimentado, los ajos, el vino y un chorrito de aceite.'),
('11111111-1111-4111-8111-111111111101',3,'Hornea durante 50–55 minutos, girando el pollo a mitad del cocinado.'),
('11111111-1111-4111-8111-111111111101',4,'Deja reposar 5 minutos antes de servir.'),
('11111111-1111-4111-8111-111111111102',0,'Cuece la pasta según el tiempo del fabricante.'),
('11111111-1111-4111-8111-111111111102',1,'Pocha la cebolla picada con un poco de aceite.'),
('11111111-1111-4111-8111-111111111102',2,'Añade el tomate, sal y orégano y cocina 10 minutos.'),
('11111111-1111-4111-8111-111111111102',3,'Incorpora el atún escurrido y mezcla.'),
('11111111-1111-4111-8111-111111111102',4,'Añade los macarrones y remueve durante un minuto.'),
('11111111-1111-4111-8111-111111111103',0,'Pela y corta las patatas en láminas finas.'),
('11111111-1111-4111-8111-111111111103',1,'Fríe lentamente las patatas y la cebolla hasta que estén tiernas.'),
('11111111-1111-4111-8111-111111111103',2,'Bate los huevos con sal y mezcla con las patatas escurridas.'),
('11111111-1111-4111-8111-111111111103',3,'Cuaja la tortilla por un lado, dale la vuelta y termina el otro lado.'),
('11111111-1111-4111-8111-111111111104',0,'Cocina el pollo a la plancha y córtalo en tiras.'),
('11111111-1111-4111-8111-111111111104',1,'Mezcla el yogur con limón, sal, pimienta y ajo en polvo.'),
('11111111-1111-4111-8111-111111111104',2,'Coloca las hojas y el tomate en una fuente.'),
('11111111-1111-4111-8111-111111111104',3,'Añade el pollo templado y termina con la salsa.'),
('11111111-1111-4111-8111-111111111105',0,'Tuesta el pan hasta que quede crujiente.'),
('11111111-1111-4111-8111-111111111105',1,'Frota ligeramente el ajo sobre las tostadas.'),
('11111111-1111-4111-8111-111111111105',2,'Ralla o aplasta el tomate.'),
('11111111-1111-4111-8111-111111111105',3,'Reparte el tomate y termina con aceite y una pizca de sal.'),
('11111111-1111-4111-8111-111111111106',0,'Precalienta el horno a 180 °C.'),
('11111111-1111-4111-8111-111111111106',1,'Bate huevos y azúcar hasta que espumen.'),
('11111111-1111-4111-8111-111111111106',2,'Añade yogur, aceite y ralladura.'),
('11111111-1111-4111-8111-111111111106',3,'Incorpora harina y levadura tamizadas.'),
('11111111-1111-4111-8111-111111111106',4,'Vierte en un molde y hornea 30–35 minutos.');

-- Las recetas por defecto son visibles pero no editables/borrables desde cuentas.
drop policy if exists "Owners can update recipes" on public.recipes;
drop policy if exists "Owners update their recipes" on public.recipes;
create policy "Owners update their recipes"
on public.recipes for update to authenticated
using (
  public.is_recetario_active()
  and owner_id = auth.uid()
  and not is_default
)
with check (
  public.is_recetario_active()
  and owner_id = auth.uid()
  and not is_default
  and (
    visibility in ('private', 'public')
    or (visibility = 'family' and public.is_recipe_family_member(family_id))
  )
);

drop policy if exists "Owners can delete recipes" on public.recipes;
drop policy if exists "Owners delete their recipes" on public.recipes;
create policy "Owners delete their recipes"
on public.recipes for delete to authenticated
using (
  public.is_recetario_active()
  and owner_id = auth.uid()
  and not is_default
);

drop policy if exists "Owners manage ingredients" on public.recipe_ingredients;
drop policy if exists "Owners manage recipe ingredients" on public.recipe_ingredients;
create policy "Owners manage recipe ingredients"
on public.recipe_ingredients for all to authenticated
using (exists (
  select 1 from public.recipes recipe
  where recipe.id = recipe_id
    and recipe.owner_id = auth.uid()
    and not recipe.is_default
))
with check (exists (
  select 1 from public.recipes recipe
  where recipe.id = recipe_id
    and recipe.owner_id = auth.uid()
    and not recipe.is_default
));

drop policy if exists "Owners manage steps" on public.recipe_steps;
drop policy if exists "Owners manage recipe steps" on public.recipe_steps;
create policy "Owners manage recipe steps"
on public.recipe_steps for all to authenticated
using (exists (
  select 1 from public.recipes recipe
  where recipe.id = recipe_id
    and recipe.owner_id = auth.uid()
    and not recipe.is_default
))
with check (exists (
  select 1 from public.recipes recipe
  where recipe.id = recipe_id
    and recipe.owner_id = auth.uid()
    and not recipe.is_default
));

-- Las recetas por defecto no cuentan como recetas personales del administrador.
create or replace function public.admin_list_recetario_accounts()
returns table (
  id uuid,
  display_name text,
  username text,
  email text,
  avatar_path text,
  role text,
  is_active boolean,
  created_at timestamptz,
  families jsonb,
  recipe_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_recetario_admin() then
    raise exception 'No tienes permisos de administrador.';
  end if;

  return query
  select
    account.id,
    account.display_name,
    account.username,
    account.email,
    account.avatar_path,
    account.role,
    account.is_active,
    account.created_at,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', family.id,
          'name', family.name,
          'member_role', membership.role
        ) order by family.name
      )
      from public.recipe_family_members membership
      join public.recipe_families family on family.id = membership.family_id
      where membership.user_id = account.id
    ), '[]'::jsonb) as families,
    (
      select count(*)::bigint
      from public.recipes recipe
      where recipe.owner_id = account.id
        and not coalesce(recipe.is_default, false)
    ) as recipe_count
  from public.recetario_accounts account
  order by case when account.role = 'admin' then 0 else 1 end,
           account.created_at asc;
end;
$$;

grant execute on function public.admin_list_recetario_accounts() to authenticated;

-- Los comentarios sobre recetas por defecto no notifican al propietario técnico.
-- Las respuestas sí notifican al autor del comentario al que se responde.
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
  target_is_default boolean;
begin
  select recipe.title, recipe.owner_id, recipe.is_default
  into target_recipe_title, recipient_id, target_is_default
  from public.recipes recipe
  where recipe.id = new.recipe_id;

  if new.parent_id is not null then
    select parent.author_id
    into recipient_id
    from public.recipe_comments parent
    where parent.id = new.parent_id;
    target_type := 'comment_reply';
  else
    if coalesce(target_is_default, false) then
      return new;
    end if;
    target_type := 'recipe_comment';
  end if;

  if recipient_id is null or recipient_id = new.author_id then
    return new;
  end if;

  insert into public.recipe_notifications (
    user_id, actor_id, recipe_id, comment_id,
    notification_type, recipe_title
  ) values (
    recipient_id, new.author_id, new.recipe_id, new.id,
    target_type, coalesce(target_recipe_title, 'Receta')
  );

  return new;
end;
$$;

notify pgrst, 'reload schema';

select
  count(*) filter (where is_default) as default_recipes_ready,
  count(*) filter (where is_default and visibility = 'public') as default_recipes_visible
from public.recipes;