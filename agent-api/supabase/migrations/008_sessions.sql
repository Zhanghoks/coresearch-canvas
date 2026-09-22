-- Session 索引。
--
-- conversations.session_entries 是一整条对话历史压在一个 jsonb 列里，会随对话无限膨胀。
-- 这里建索引表，正文改落 Storage；conversations 上的列先保留不动，
-- 切换完成并确认后再单独停写（不在本迁移里删列）。

create table public.sessions (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    runtime_session_id text,
    storage_bucket text,
    storage_path text,
    storage_version integer not null default 1,
    revision bigint not null default 0 check (revision >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (conversation_id)
);

create index sessions_project on public.sessions (project_id);

create trigger sessions_updated_at before update on public.sessions
for each row execute function public.set_updated_at();

alter table public.sessions enable row level security;

create policy sessions_owner_all on public.sessions
for all to authenticated
using (
    auth.uid() is not null and exists (
        select 1 from public.projects p
        join public.conversations c on c.project_id = p.id
        where p.id = sessions.project_id
          and c.id = sessions.conversation_id
          and p.owner_user_id = auth.uid()
          and c.owner_user_id = auth.uid()
    )
)
with check (
    auth.uid() is not null and exists (
        select 1 from public.projects p
        join public.conversations c on c.project_id = p.id
        where p.id = sessions.project_id
          and c.id = sessions.conversation_id
          and p.owner_user_id = auth.uid()
          and c.owner_user_id = auth.uid()
    )
);

revoke all on public.sessions from anon, authenticated;
grant select, insert, delete on public.sessions to authenticated;
grant update (runtime_session_id, storage_bucket, storage_path, revision) on public.sessions to authenticated;
