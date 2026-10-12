-- Bancada PRISMA: equipe por e-mail, sugestões de IA e registro de uso de IA
-- Aplique depois de 0001_schema.sql (supabase db push, ou cole no SQL Editor).

-- ---------------------------------------------------------------------------
-- Equipe: listar com e-mail e convidar quem já tem conta
-- ---------------------------------------------------------------------------
create or replace function public.project_team(p uuid)
returns table (user_id uuid, email text, role public.member_role, slot smallint)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, m.role, m.slot
    from project_members m join auth.users u on u.id = m.user_id
   where m.project_id = p and public.is_member(p)
   order by m.added_at;
$$;
grant execute on function public.project_team(uuid) to authenticated;

create or replace function public.add_member(p uuid, member_email text, member_role public.member_role default 'reviewer') returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_owner(p) then raise exception 'Só o dono do projeto gerencia a equipe'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(member_email));
  if uid is null then raise exception 'Nenhuma conta com este e-mail. Peça para a pessoa entrar no site uma vez e tente de novo.'; end if;
  insert into project_members (project_id, user_id, role) values (p, uid, member_role) on conflict (project_id, user_id) do nothing;
  return uid;
end $$;
grant execute on function public.add_member(uuid, text, public.member_role) to authenticated;

-- ---------------------------------------------------------------------------
-- Sugestões de IA na triagem de títulos e resumos
-- ---------------------------------------------------------------------------
create table public.ai_suggestions (
  record_id   uuid primary key references public.records(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  decision    public.decision not null,
  criterion   text,                                     -- código do critério, quando exclui
  reason      text,
  model       text,
  created_at  timestamptz not null default now()
);
create index ai_suggestions_project_idx on public.ai_suggestions (project_id);
alter table public.ai_suggestions enable row level security;

-- Quem ocupa uma vaga de revisor só vê a sugestão depois de votar no registro.
create policy "sugestão só depois do voto" on public.ai_suggestions for select using (
  public.is_member(project_id) and (
    not exists (select 1 from public.project_members m where m.project_id = ai_suggestions.project_id and m.user_id = auth.uid() and m.slot is not null)
    or exists (select 1 from public.votes v where v.record_id = ai_suggestions.record_id and v.stage = 'ta' and v.reviewer_id = auth.uid())
  )
);
create policy "editores gravam sugestões" on public.ai_suggestions for insert with check (public.can_edit(project_id));
create policy "editores removem sugestões" on public.ai_suggestions for delete using (public.can_edit(project_id));

-- Quais registros já têm sugestão, sem revelar a sugestão.
create or replace function public.ai_suggested_ids(p uuid) returns table (record_id uuid)
language sql stable security definer set search_path = public as $$
  select s.record_id from ai_suggestions s where s.project_id = p and public.is_member(p);
$$;
grant execute on function public.ai_suggested_ids(uuid) to authenticated;

-- Entradas criadas pela própria ferramenta (sugestões pedidas na triagem)
alter table public.ai_log add column if not exists auto boolean not null default false;
