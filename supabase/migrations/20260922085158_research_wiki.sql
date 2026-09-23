-- Research Wiki：Project 内持续积累的文献知识层。
-- literature-wiki/ 下的 Markdown 是 materialization，不是真值；这里才是。
--
-- papers / paper_sources / paper_sections / paper_fragments 是跨 Project 共享的全局目录，
-- 所以不带 project_id：同一篇论文被多个 Project 引用时不重复存 metadata。
-- 写入只允许 service_role（经 agent-api），authenticated 只读。
-- per-project 的态（project_papers / paper_readings / paper_relations / idea_anchors）带 project_id + owner RLS。

create table public.papers (
    id uuid primary key default gen_random_uuid(),
    doi text,
    arxiv_id text,
    semantic_scholar_id text,
    title text not null check (length(trim(title)) > 0),
    authors jsonb not null default '[]'::jsonb check (jsonb_typeof(authors) = 'array'),
    year integer,
    venue text,
    created_at timestamptz not null default now()
);

create unique index papers_doi on public.papers (doi) where doi is not null;
create unique index papers_arxiv on public.papers (arxiv_id) where arxiv_id is not null;

create table public.paper_sources (
    id uuid primary key default gen_random_uuid(),
    paper_id uuid not null references public.papers(id) on delete cascade,
    kind text not null check (kind in ('arxiv', 'publisher_pdf', 'html', 'other')),
    version text,
    url text,
    storage_bucket text,
    storage_path text,
    content_hash text,
    fetched_at timestamptz not null default now()
);

create index paper_sources_paper on public.paper_sources (paper_id);

create table public.paper_sections (
    id uuid primary key default gen_random_uuid(),
    paper_source_id uuid not null references public.paper_sources(id) on delete cascade,
    heading text not null default '',
    order_index integer not null default 0,
    char_start integer,
    char_end integer
);

create index paper_sections_source on public.paper_sections (paper_source_id, order_index);

-- Fragment 必须属于具体 paper_source，不能只属于 Paper：
-- 否则版本更新后页码、段落和原文证据会漂移。
create table public.paper_fragments (
    id uuid primary key default gen_random_uuid(),
    paper_source_id uuid not null references public.paper_sources(id) on delete cascade,
    section_id uuid references public.paper_sections(id) on delete set null,
    text text not null,
    page integer,
    char_start integer,
    char_end integer
);

create index paper_fragments_source on public.paper_fragments (paper_source_id);

create table public.project_papers (
    project_id uuid not null references public.projects(id) on delete cascade,
    paper_id uuid not null references public.papers(id) on delete cascade,
    status text not null default 'candidate' check (status in ('candidate', 'reading', 'cited', 'dropped')),
    added_by uuid not null references auth.users(id) on delete cascade,
    first_seen_run_id uuid references public.agent_runs(id) on delete set null,
    created_at timestamptz not null default now(),
    primary key (project_id, paper_id)
);

create table public.paper_readings (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    paper_id uuid not null references public.papers(id) on delete cascade,
    state text not null default 'unread' check (state in ('unread', 'skimmed', 'read', 'deep_read')),
    notes text not null default '',
    created_by uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (project_id, paper_id)
);

create table public.paper_relations (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    from_paper_id uuid not null references public.papers(id) on delete cascade,
    to_paper_id uuid not null references public.papers(id) on delete cascade,
    relation_type text not null check (length(trim(relation_type)) > 0),
    created_at timestamptz not null default now(),
    check (from_paper_id <> to_paper_id),
    unique (project_id, from_paper_id, to_paper_id, relation_type)
);

-- Wiki 描述「世界里有哪些研究」；Anchor 描述「用户的 Idea 如何理解和使用这些研究」。
-- 不在 Paper / Fragment 上维护反向 ideaIds，反查一律走这张表。
create table public.idea_anchors (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    entity_id uuid not null references public.research_entities(id) on delete cascade,
    entity_revision_id uuid references public.research_entity_revisions(id) on delete set null,
    paper_id uuid not null references public.papers(id) on delete cascade,
    paper_source_id uuid references public.paper_sources(id) on delete set null,
    paper_fragment_id uuid references public.paper_fragments(id) on delete set null,
    relation text not null check (relation in (
        'supports', 'contradicts', 'similar_method', 'motivates', 'evaluation_basis', 'prior_art'
    )),
    created_by uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

create index idea_anchors_entity on public.idea_anchors (entity_id);
create index idea_anchors_paper on public.idea_anchors (paper_id);

create table public.paper_workspaces (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    title text not null check (length(trim(title)) > 0),
    status text not null default 'draft' check (status in ('draft', 'writing', 'review', 'done')),
    created_by uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger paper_readings_updated_at before update on public.paper_readings
for each row execute function public.set_updated_at();
create trigger paper_workspaces_updated_at before update on public.paper_workspaces
for each row execute function public.set_updated_at();

alter table public.papers enable row level security;
alter table public.paper_sources enable row level security;
alter table public.paper_sections enable row level security;
alter table public.paper_fragments enable row level security;
alter table public.project_papers enable row level security;
alter table public.paper_readings enable row level security;
alter table public.paper_relations enable row level security;
alter table public.idea_anchors enable row level security;
alter table public.paper_workspaces enable row level security;

-- 全局文献目录：登录用户可读，写入只走 service_role。
create policy papers_read on public.papers for select to authenticated using (auth.uid() is not null);
create policy paper_sources_read on public.paper_sources for select to authenticated using (auth.uid() is not null);
create policy paper_sections_read on public.paper_sections for select to authenticated using (auth.uid() is not null);
create policy paper_fragments_read on public.paper_fragments for select to authenticated using (auth.uid() is not null);

create policy project_papers_owner_all on public.project_papers
for all to authenticated
using (
    auth.uid() is not null and exists (
        select 1 from public.projects p where p.id = project_id and p.owner_user_id = auth.uid()
    )
)
with check (
    auth.uid() is not null and exists (
        select 1 from public.projects p where p.id = project_id and p.owner_user_id = auth.uid()
    )
);

create policy paper_readings_owner_all on public.paper_readings
for all to authenticated
using (
    auth.uid() is not null and exists (
        select 1 from public.projects p where p.id = project_id and p.owner_user_id = auth.uid()
    )
)
with check (
    auth.uid() is not null and exists (
        select 1 from public.projects p where p.id = project_id and p.owner_user_id = auth.uid()
    )
);

create policy paper_relations_owner_all on public.paper_relations
for all to authenticated
using (
    auth.uid() is not null and exists (
        select 1 from public.projects p where p.id = project_id and p.owner_user_id = auth.uid()
    )
)
with check (
    auth.uid() is not null and exists (
        select 1 from public.projects p where p.id = project_id and p.owner_user_id = auth.uid()
    )
);

create policy idea_anchors_owner_all on public.idea_anchors
for all to authenticated
using (
    auth.uid() is not null and exists (
        select 1 from public.projects p
        join public.research_entities e on e.project_id = p.id
        where p.id = idea_anchors.project_id
          and e.id = idea_anchors.entity_id
          and p.owner_user_id = auth.uid()
    )
)
with check (
    auth.uid() is not null and exists (
        select 1 from public.projects p
        join public.research_entities e on e.project_id = p.id
        where p.id = idea_anchors.project_id
          and e.id = idea_anchors.entity_id
          and p.owner_user_id = auth.uid()
    )
);

create policy paper_workspaces_owner_all on public.paper_workspaces
for all to authenticated
using (
    auth.uid() is not null and exists (
        select 1 from public.projects p where p.id = project_id and p.owner_user_id = auth.uid()
    )
)
with check (
    auth.uid() is not null and exists (
        select 1 from public.projects p where p.id = project_id and p.owner_user_id = auth.uid()
    )
);

revoke all on public.papers, public.paper_sources, public.paper_sections, public.paper_fragments,
    public.project_papers, public.paper_readings, public.paper_relations, public.idea_anchors,
    public.paper_workspaces from anon, authenticated;

grant select on public.papers, public.paper_sources, public.paper_sections, public.paper_fragments to authenticated;
grant select, insert, delete on public.project_papers to authenticated;
grant update (status, first_seen_run_id) on public.project_papers to authenticated;
grant select, insert, delete on public.paper_readings to authenticated;
grant update (state, notes) on public.paper_readings to authenticated;
grant select, insert, delete on public.paper_relations to authenticated;
grant select, insert, delete on public.idea_anchors to authenticated;
grant select, insert, delete on public.paper_workspaces to authenticated;
grant update (title, status) on public.paper_workspaces to authenticated;
