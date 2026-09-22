-- Artifact 与二进制资产索引。正文/文件在 Supabase Storage，数据库只存索引。
--
-- Artifact 是 Project-scoped、immutable、带明确来源的派生产物：
-- 没有原地 update / delete，修订即创建新 Artifact。这靠 grant 而不是靠应用层自律实现。

create table public.artifacts (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    -- 与 canvas-agent/src/artifacts/store.ts 的 researchArtifactKinds 保持一致。
    kind text not null check (kind in (
        'seed-brief', 'direction-map', 'rq-comparison', 'problem-evidence',
        'hypothesis-test-plan', 'approach-tradeoff', 'method-protocol',
        'evaluation-matrix', 'idea-review', 'paper-plan', 'paper-draft',
        'paper-audit', 'export'
    )),
    title text not null check (length(trim(title)) > 0),
    storage_bucket text not null,
    storage_path text not null,
    content_hash text not null,
    created_by uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    conversation_id uuid references public.conversations(id) on delete set null,
    run_id uuid references public.agent_runs(id) on delete set null,
    turn_id text,
    source_entity_ids uuid[] not null default '{}'
);

create index artifacts_project_created on public.artifacts (project_id, created_at desc);

create table public.canvas_assets (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    storage_bucket text not null,
    storage_path text not null,
    mime_type text not null,
    bytes bigint not null default 0 check (bytes >= 0),
    content_hash text not null,
    natural_width integer,
    natural_height integer,
    duration_ms integer,
    created_by uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

create index canvas_assets_project on public.canvas_assets (project_id);

alter table public.artifacts enable row level security;
alter table public.canvas_assets enable row level security;

create policy artifacts_owner_all on public.artifacts
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

create policy canvas_assets_owner_all on public.canvas_assets
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

revoke all on public.artifacts, public.canvas_assets from anon, authenticated;

-- 只给 select + insert：不可变性由权限保证，没有 update / delete 入口。
grant select, insert on public.artifacts to authenticated;
grant select, insert, delete on public.canvas_assets to authenticated;

-- Storage：私有 bucket，路径第一段必须是当前用户拥有的 projectId。
insert into storage.buckets (id, name, public)
values
    ('coresearch-assets', 'coresearch-assets', false),
    ('coresearch-papers', 'coresearch-papers', false),
    ('coresearch-artifacts', 'coresearch-artifacts', false)
on conflict (id) do nothing;

create policy coresearch_assets_owner on storage.objects
for all to authenticated
using (
    bucket_id = 'coresearch-assets' and exists (
        select 1 from public.projects p
        where p.id::text = (storage.foldername(name))[1] and p.owner_user_id = auth.uid()
    )
)
with check (
    bucket_id = 'coresearch-assets' and exists (
        select 1 from public.projects p
        where p.id::text = (storage.foldername(name))[1] and p.owner_user_id = auth.uid()
    )
);

create policy coresearch_artifacts_owner on storage.objects
for all to authenticated
using (
    bucket_id = 'coresearch-artifacts' and exists (
        select 1 from public.projects p
        where p.id::text = (storage.foldername(name))[1] and p.owner_user_id = auth.uid()
    )
)
with check (
    bucket_id = 'coresearch-artifacts' and exists (
        select 1 from public.projects p
        where p.id::text = (storage.foldername(name))[1] and p.owner_user_id = auth.uid()
    )
);

-- 论文原文按 Project 隔离落盘（同一篇论文被多个 Project 收录时各存一份副本，
-- 换取「浏览器可直接凭 JWT 取自己 Project 的文件」这条简单规则）。
create policy coresearch_papers_owner on storage.objects
for all to authenticated
using (
    bucket_id = 'coresearch-papers' and exists (
        select 1 from public.projects p
        where p.id::text = (storage.foldername(name))[1] and p.owner_user_id = auth.uid()
    )
)
with check (
    bucket_id = 'coresearch-papers' and exists (
        select 1 from public.projects p
        where p.id::text = (storage.foldername(name))[1] and p.owner_user_id = auth.uid()
    )
);
