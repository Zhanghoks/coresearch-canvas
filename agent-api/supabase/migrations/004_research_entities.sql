-- Research DB：研究对象真值。
-- Canvas 只是投影（见 005）；标题、正文、revision、确认状态都归这里。

create table public.research_entities (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    type text not null check (type in (
        'seed', 'direction', 'research_question', 'problem', 'hypothesis',
        'approach', 'method', 'evaluation', 'idea'
    )),
    head_revision_id uuid,
    created_by uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz
);

create index research_entities_project_type on public.research_entities (project_id, type);

create table public.research_entity_revisions (
    id uuid primary key default gen_random_uuid(),
    entity_id uuid not null references public.research_entities(id) on delete cascade,
    project_id uuid not null references public.projects(id) on delete cascade,
    revision integer not null check (revision > 0),
    title text not null check (length(trim(title)) > 0),
    summary text not null default '',
    document text not null default '',
    attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
    status text not null default 'draft' check (status in ('draft', 'confirmed', 'superseded', 'archived')),
    created_by uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (entity_id, revision)
);

alter table public.research_entities
    add constraint research_entities_head_revision_fkey
    foreign key (head_revision_id) references public.research_entity_revisions(id) on delete set null;

create table public.research_relations (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    source_entity_id uuid not null references public.research_entities(id) on delete cascade,
    target_entity_id uuid not null references public.research_entities(id) on delete cascade,
    relation_type text not null check (length(trim(relation_type)) > 0),
    created_by uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    check (source_entity_id <> target_entity_id),
    unique (source_entity_id, target_entity_id, relation_type)
);

create index research_relations_project on public.research_relations (project_id);

-- Group 不是 Research Entity：它同时表达 UI 分组和一次 Agent Run 的 provenance。
create table public.research_groups (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    canvas_id uuid not null references public.canvas_workspaces(id) on delete cascade,
    type text not null check (length(trim(type)) > 0),
    source_entity_id uuid references public.research_entities(id) on delete set null,
    source_run_id uuid references public.agent_runs(id) on delete set null,
    title text not null default '',
    created_at timestamptz not null default now()
);

create table public.research_group_members (
    group_id uuid not null references public.research_groups(id) on delete cascade,
    entity_id uuid not null references public.research_entities(id) on delete cascade,
    order_index integer not null default 0,
    primary key (group_id, entity_id)
);

create trigger research_entities_updated_at before update on public.research_entities
for each row execute function public.set_updated_at();

alter table public.research_entities enable row level security;
alter table public.research_entity_revisions enable row level security;
alter table public.research_relations enable row level security;
alter table public.research_groups enable row level security;
alter table public.research_group_members enable row level security;

create policy research_entities_owner_all on public.research_entities
for all to authenticated
using (
    auth.uid() is not null and exists (
        select 1 from public.projects p
        where p.id = project_id and p.owner_user_id = auth.uid()
    )
)
with check (
    auth.uid() is not null and exists (
        select 1 from public.projects p
        where p.id = project_id and p.owner_user_id = auth.uid()
    )
);

create policy research_entity_revisions_owner_all on public.research_entity_revisions
for all to authenticated
using (
    auth.uid() is not null and exists (
        select 1 from public.projects p
        join public.research_entities e on e.project_id = p.id
        where e.id = research_entity_revisions.entity_id
          and p.id = research_entity_revisions.project_id
          and p.owner_user_id = auth.uid()
    )
)
with check (
    auth.uid() is not null and exists (
        select 1 from public.projects p
        join public.research_entities e on e.project_id = p.id
        where e.id = research_entity_revisions.entity_id
          and p.id = research_entity_revisions.project_id
          and p.owner_user_id = auth.uid()
    )
);

create policy research_relations_owner_all on public.research_relations
for all to authenticated
using (
    auth.uid() is not null and exists (
        select 1 from public.projects p
        join public.research_entities s on s.project_id = p.id
        join public.research_entities t on t.project_id = p.id
        where p.id = research_relations.project_id
          and s.id = research_relations.source_entity_id
          and t.id = research_relations.target_entity_id
          and p.owner_user_id = auth.uid()
    )
)
with check (
    auth.uid() is not null and exists (
        select 1 from public.projects p
        join public.research_entities s on s.project_id = p.id
        join public.research_entities t on t.project_id = p.id
        where p.id = research_relations.project_id
          and s.id = research_relations.source_entity_id
          and t.id = research_relations.target_entity_id
          and p.owner_user_id = auth.uid()
    )
);

create policy research_groups_owner_all on public.research_groups
for all to authenticated
using (
    auth.uid() is not null and exists (
        select 1 from public.projects p
        join public.canvas_workspaces w on w.project_id = p.id
        where p.id = research_groups.project_id
          and w.id = research_groups.canvas_id
          and p.owner_user_id = auth.uid()
    )
)
with check (
    auth.uid() is not null and exists (
        select 1 from public.projects p
        join public.canvas_workspaces w on w.project_id = p.id
        where p.id = research_groups.project_id
          and w.id = research_groups.canvas_id
          and p.owner_user_id = auth.uid()
    )
);

create policy research_group_members_owner_all on public.research_group_members
for all to authenticated
using (
    auth.uid() is not null and exists (
        select 1 from public.research_groups g
        join public.projects p on p.id = g.project_id
        join public.research_entities e on e.project_id = p.id
        where g.id = research_group_members.group_id
          and e.id = research_group_members.entity_id
          and p.owner_user_id = auth.uid()
    )
)
with check (
    auth.uid() is not null and exists (
        select 1 from public.research_groups g
        join public.projects p on p.id = g.project_id
        join public.research_entities e on e.project_id = p.id
        where g.id = research_group_members.group_id
          and e.id = research_group_members.entity_id
          and p.owner_user_id = auth.uid()
    )
);

revoke all on public.research_entities, public.research_entity_revisions, public.research_relations,
    public.research_groups, public.research_group_members from anon, authenticated;

grant select, insert, delete on public.research_entities to authenticated;
grant update (head_revision_id, archived_at) on public.research_entities to authenticated;
-- Revision 正文不可改写；只有 status 可以在被新 revision 取代时推进。
grant select, insert on public.research_entity_revisions to authenticated;
grant update (status) on public.research_entity_revisions to authenticated;
grant select, insert, delete on public.research_relations to authenticated;
grant select, insert, delete on public.research_groups to authenticated;
grant update (type, title) on public.research_groups to authenticated;
grant select, insert, delete on public.research_group_members to authenticated;
grant update (order_index) on public.research_group_members to authenticated;

-- 建对象 = 建 entity + revision 1 + 指向 head，必须是一个事务。
create or replace function public.create_research_entity(
    target_project_id uuid,
    entity_type text,
    next_title text,
    next_summary text,
    next_document text,
    next_attributes jsonb,
    next_status text
)
returns setof public.research_entities
language plpgsql
security invoker
set search_path = ''
as $$
declare
    created_entity public.research_entities;
    created_revision public.research_entity_revisions;
begin
    insert into public.research_entities (project_id, type, created_by)
    values (target_project_id, entity_type, auth.uid())
    returning * into created_entity;

    insert into public.research_entity_revisions
        (entity_id, project_id, revision, title, summary, document, attributes, status, created_by)
    values
        (created_entity.id, target_project_id, 1, next_title, coalesce(next_summary, ''),
         coalesce(next_document, ''), coalesce(next_attributes, '{}'::jsonb),
         coalesce(next_status, 'draft'), auth.uid())
    returning * into created_revision;

    return query
    update public.research_entities e
    set head_revision_id = created_revision.id
    where e.id = created_entity.id
    returning e.*;
end;
$$;

-- 追加 revision：正文只增不改。新 revision 为 confirmed 时，旧的 confirmed 落为 superseded。
create or replace function public.append_research_entity_revision(
    target_project_id uuid,
    target_entity_id uuid,
    next_title text,
    next_summary text,
    next_document text,
    next_attributes jsonb,
    next_status text
)
returns setof public.research_entity_revisions
language plpgsql
security invoker
set search_path = ''
as $$
declare
    created_revision public.research_entity_revisions;
    next_number integer;
begin
    select coalesce(max(r.revision), 0) + 1 into next_number
    from public.research_entity_revisions r
    where r.entity_id = target_entity_id and r.project_id = target_project_id;

    insert into public.research_entity_revisions
        (entity_id, project_id, revision, title, summary, document, attributes, status, created_by)
    values
        (target_entity_id, target_project_id, next_number, next_title, coalesce(next_summary, ''),
         coalesce(next_document, ''), coalesce(next_attributes, '{}'::jsonb),
         coalesce(next_status, 'draft'), auth.uid())
    returning * into created_revision;

    if created_revision.status = 'confirmed' then
        update public.research_entity_revisions r
        set status = 'superseded'
        where r.entity_id = target_entity_id
          and r.id <> created_revision.id
          and r.status = 'confirmed';
    end if;

    update public.research_entities e
    set head_revision_id = created_revision.id
    where e.id = target_entity_id and e.project_id = target_project_id;

    return next created_revision;
end;
$$;

revoke execute on function public.create_research_entity(uuid, text, text, text, text, jsonb, text) from public, anon;
revoke execute on function public.append_research_entity_revision(uuid, uuid, text, text, text, jsonb, text) from public, anon;
grant execute on function public.create_research_entity(uuid, text, text, text, text, jsonb, text) to authenticated;
grant execute on function public.append_research_entity_revision(uuid, uuid, text, text, text, jsonb, text) to authenticated;
