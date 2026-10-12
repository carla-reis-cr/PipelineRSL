-- Bancada PRISMA: esquema inicial para Supabase (Postgres)
-- Aplique com: supabase db push   (ou cole no SQL Editor do painel)

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Projetos e equipe
-- ---------------------------------------------------------------------------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default '',
  protocol    jsonb not null default '{}'::jsonb,     -- mesmo formato do protocolo.json
  created_by  uuid not null default auth.uid() references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create type public.member_role as enum ('owner', 'reviewer', 'viewer');

create table public.project_members (
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.member_role not null default 'reviewer',
  slot        smallint check (slot in (1, 2)),          -- Revisor 1 / Revisor 2
  added_at    timestamptz not null default now(),
  primary key (project_id, user_id),
  unique (project_id, slot)
);

-- ---------------------------------------------------------------------------
-- Busca e registros
-- ---------------------------------------------------------------------------
create table public.imports (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  source       text not null,                          -- scopus, ieee_xplore, acm_dl…
  method       text not null check (method in ('api', 'file')),
  file_name    text,
  query        text,                                    -- query enviada (API) ou string usada no site
  total_reported integer,                               -- total informado pela base
  cursor       text,                                    -- próxima página (API); nulo = concluída
  status       text not null default 'running' check (status in ('running', 'done', 'paused', 'error')),
  error        text,
  record_count integer not null default 0,
  created_by   uuid not null default auth.uid() references auth.users(id),
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);

create table public.records (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  import_id   uuid not null references public.imports(id) on delete cascade,
  source      text not null,
  title       text not null,
  authors     text,
  year        integer,
  venue       text,
  doi         text,
  abstract    text,
  url         text,
  doc_type    text,
  language    text,
  keywords    text,
  pages       integer,
  raw_id      text not null,                            -- id na base (API) ou posição no arquivo (file:N)
  created_at  timestamptz not null default now()
);
create index records_project_idx on public.records (project_id);
-- evita gravar duas vezes o mesmo registro ao repetir uma página da API
alter table public.records add constraint records_import_raw_key unique (import_id, raw_id);

-- ---------------------------------------------------------------------------
-- Triagem, consenso e extração
-- ---------------------------------------------------------------------------
create type public.stage as enum ('ta', 'ft');           -- título/resumo; elegibilidade
create type public.decision as enum ('inc', 'may', 'exc', 'nr');

create table public.votes (
  record_id   uuid not null references public.records(id) on delete cascade,
  stage       public.stage not null,
  reviewer_id uuid not null default auth.uid() references auth.users(id),
  project_id  uuid not null references public.projects(id) on delete cascade,
  decision    public.decision not null,
  reason      text,                                     -- código do critério (IC/EC)
  criteria    jsonb not null default '{}'::jsonb,       -- respostas por critério: {"IC1":"y",…}
  bulk        boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (record_id, stage, reviewer_id)
);
create index votes_project_idx on public.votes (project_id, stage);

create table public.consensus (
  record_id   uuid not null references public.records(id) on delete cascade,
  stage       public.stage not null,
  project_id  uuid not null references public.projects(id) on delete cascade,
  decision    public.decision not null,
  reason      text,
  decided_by  uuid not null default auth.uid() references auth.users(id),
  decided_at  timestamptz not null default now(),
  primary key (record_id, stage)
);

create table public.extractions (
  record_id   uuid primary key references public.records(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,       -- {"SQ1":{"a":[…],"x":[…],"n":"evidência"},…}
  done        boolean not null default false,
  updated_by  uuid not null default auth.uid() references auth.users(id),
  updated_at  timestamptz not null default now()
);

create table public.ai_log (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  stage       text not null,
  tool        text not null,
  what        text not null,
  verification text,
  created_by  uuid not null default auth.uid() references auth.users(id),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Funções de acesso (security definer para não recursar nas políticas)
-- ---------------------------------------------------------------------------
create or replace function public.is_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members m where m.project_id = p and m.user_id = auth.uid());
$$;

create or replace function public.can_edit(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members m where m.project_id = p and m.user_id = auth.uid() and m.role in ('owner', 'reviewer'));
$$;

create or replace function public.is_owner(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members m where m.project_id = p and m.user_id = auth.uid() and m.role = 'owner');
$$;

-- Triagem cega: o voto de outro revisor só é visível depois que eu votei no
-- mesmo registro e etapa, ou se o protocolo desligou a triagem cega.
create or replace function public.can_see_vote(p uuid, rec uuid, st public.stage, voter uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select voter = auth.uid()
      or coalesce((select (protocol->>'blind')::boolean from projects where id = p), true) = false
      or exists (select 1 from votes v where v.record_id = rec and v.stage = st and v.reviewer_id = auth.uid());
$$;

-- Quem cria o projeto vira dono automaticamente
create or replace function public.add_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into project_members (project_id, user_id, role, slot) values (new.id, new.created_by, 'owner', 1);
  return new;
end $$;
create trigger projects_add_owner after insert on public.projects for each row execute function public.add_owner();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger votes_touch before update on public.votes for each row execute function public.touch_updated_at();
create trigger extractions_touch before update on public.extractions for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.imports         enable row level security;
alter table public.records         enable row level security;
alter table public.votes           enable row level security;
alter table public.consensus       enable row level security;
alter table public.extractions     enable row level security;
alter table public.ai_log          enable row level security;

create policy "membros leem o projeto"   on public.projects for select using (public.is_member(id));
create policy "qualquer usuário cria"    on public.projects for insert with check (created_by = auth.uid());
create policy "editores alteram"         on public.projects for update using (public.can_edit(id));
create policy "dono apaga"               on public.projects for delete using (public.is_owner(id));

create policy "membros veem a equipe"    on public.project_members for select using (public.is_member(project_id));
create policy "dono gerencia a equipe"   on public.project_members for all using (public.is_owner(project_id)) with check (public.is_owner(project_id));

create policy "membros leem importações" on public.imports for select using (public.is_member(project_id));
create policy "editores importam"        on public.imports for insert with check (public.can_edit(project_id));
create policy "editores atualizam"       on public.imports for update using (public.can_edit(project_id));
create policy "editores removem"         on public.imports for delete using (public.can_edit(project_id));

create policy "membros leem registros"   on public.records for select using (public.is_member(project_id));
create policy "editores gravam registros" on public.records for insert with check (public.can_edit(project_id));
create policy "editores removem registros" on public.records for delete using (public.can_edit(project_id));

create policy "triagem cega"             on public.votes for select using (public.is_member(project_id) and public.can_see_vote(project_id, record_id, stage, reviewer_id));
create policy "revisor vota por si"      on public.votes for insert with check (reviewer_id = auth.uid() and public.can_edit(project_id));
create policy "revisor altera o próprio voto" on public.votes for update using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());
create policy "revisor apaga o próprio voto"  on public.votes for delete using (reviewer_id = auth.uid());

create policy "membros leem consenso"    on public.consensus for select using (public.is_member(project_id));
create policy "editores decidem consenso" on public.consensus for all using (public.can_edit(project_id)) with check (public.can_edit(project_id));

create policy "membros leem extração"    on public.extractions for select using (public.is_member(project_id));
create policy "editores extraem"         on public.extractions for all using (public.can_edit(project_id)) with check (public.can_edit(project_id));

create policy "membros leem registro de IA" on public.ai_log for select using (public.is_member(project_id));
create policy "editores registram IA"    on public.ai_log for all using (public.can_edit(project_id)) with check (public.can_edit(project_id));

-- Revisor ocupa ou libera a própria vaga (1 ou 2) sem poder mudar o próprio papel.
create or replace function public.set_my_slot(p uuid, new_slot smallint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit(p) then raise exception 'Sem permissão neste projeto'; end if;
  if new_slot is not null and exists (select 1 from project_members where project_id = p and slot = new_slot and user_id <> auth.uid()) then
    raise exception 'Vaga % já ocupada', new_slot;
  end if;
  update project_members set slot = new_slot where project_id = p and user_id = auth.uid();
end $$;
grant execute on function public.set_my_slot(uuid, smallint) to authenticated;
