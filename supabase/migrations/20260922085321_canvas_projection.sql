-- Canvas Projection：把 canvas_workspaces.snapshot 这个 blob 拆成结构化投影。
-- 位置、尺寸、显示状态属于这里；标题、正文、revision、确认状态属于 research_* （见 004）。
-- snapshot 列保留但不再写，作为切换期间的回滚出口。

create table public.canvas_nodes (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    canvas_id uuid not null references public.canvas_workspaces(id) on delete cascade,
    -- 前端 id 形如 "seed-1758…-x7q"，不是 uuid，且只在画布内唯一。
    client_node_id text not null check (length(trim(client_node_id)) > 0),
    -- 开放字符串：插件节点用 "<pluginId>:<name>"，不能收成枚举。
    type text not null check (length(trim(type)) > 0),
    -- 只有九种研究节点有 entity；image/note/frame/pdf/插件节点为 null。
    entity_id uuid references public.research_entities(id) on delete set null,
    x double precision not null default 0,
    y double precision not null default 0,
    width double precision not null default 0,
    height double precision not null default 0,
    group_client_id text,
    display_state jsonb not null default '{}'::jsonb check (jsonb_typeof(display_state) = 'object'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (canvas_id, client_node_id)
);

-- 同一个 Entity 可以投影到同一 Project 的多个 Canvas，所以 (canvas_id, entity_id) 不设唯一约束。
create index canvas_nodes_entity on public.canvas_nodes (entity_id) where entity_id is not null;

create table public.canvas_edges (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    canvas_id uuid not null references public.canvas_workspaces(id) on delete cascade,
    client_edge_id text not null check (length(trim(client_edge_id)) > 0),
    source_node_id uuid not null references public.canvas_nodes(id) on delete cascade,
    target_node_id uuid not null references public.canvas_nodes(id) on delete cascade,
    relation_type text,
    created_at timestamptz not null default now(),
    unique (canvas_id, client_edge_id)
);

create index canvas_edges_canvas on public.canvas_edges (canvas_id);

create table public.canvas_viewport (
    canvas_id uuid primary key references public.canvas_workspaces(id) on delete cascade,
    project_id uuid not null references public.projects(id) on delete cascade,
    x double precision not null default 0,
    y double precision not null default 0,
    k double precision not null default 1,
    background_mode text,
    show_image_info boolean not null default false,
    updated_at timestamptz not null default now()
);

create trigger canvas_nodes_updated_at before update on public.canvas_nodes
for each row execute function public.set_updated_at();
create trigger canvas_viewport_updated_at before update on public.canvas_viewport
for each row execute function public.set_updated_at();

alter table public.canvas_nodes enable row level security;
alter table public.canvas_edges enable row level security;
alter table public.canvas_viewport enable row level security;

create policy canvas_nodes_owner_all on public.canvas_nodes
for all to authenticated
using (
    auth.uid() is not null and exists (
        select 1 from public.projects p
        join public.canvas_workspaces w on w.project_id = p.id
        where p.id = canvas_nodes.project_id
          and w.id = canvas_nodes.canvas_id
          and p.owner_user_id = auth.uid()
    )
)
with check (
    auth.uid() is not null and exists (
        select 1 from public.projects p
        join public.canvas_workspaces w on w.project_id = p.id
        where p.id = canvas_nodes.project_id
          and w.id = canvas_nodes.canvas_id
          and p.owner_user_id = auth.uid()
    )
);

create policy canvas_edges_owner_all on public.canvas_edges
for all to authenticated
using (
    auth.uid() is not null and exists (
        select 1 from public.projects p
        join public.canvas_workspaces w on w.project_id = p.id
        where p.id = canvas_edges.project_id
          and w.id = canvas_edges.canvas_id
          and p.owner_user_id = auth.uid()
    )
)
with check (
    auth.uid() is not null and exists (
        select 1 from public.projects p
        join public.canvas_workspaces w on w.project_id = p.id
        where p.id = canvas_edges.project_id
          and w.id = canvas_edges.canvas_id
          and p.owner_user_id = auth.uid()
    )
);

create policy canvas_viewport_owner_all on public.canvas_viewport
for all to authenticated
using (
    auth.uid() is not null and exists (
        select 1 from public.projects p
        join public.canvas_workspaces w on w.project_id = p.id
        where p.id = canvas_viewport.project_id
          and w.id = canvas_viewport.canvas_id
          and p.owner_user_id = auth.uid()
    )
)
with check (
    auth.uid() is not null and exists (
        select 1 from public.projects p
        join public.canvas_workspaces w on w.project_id = p.id
        where p.id = canvas_viewport.project_id
          and w.id = canvas_viewport.canvas_id
          and p.owner_user_id = auth.uid()
    )
);

revoke all on public.canvas_nodes, public.canvas_edges, public.canvas_viewport from anon, authenticated;

grant select, insert, delete on public.canvas_nodes to authenticated;
grant update (type, entity_id, x, y, width, height, group_client_id, display_state) on public.canvas_nodes to authenticated;
grant select, insert, delete on public.canvas_edges to authenticated;
grant update (source_node_id, target_node_id, relation_type) on public.canvas_edges to authenticated;
grant select, insert, delete on public.canvas_viewport to authenticated;
grant update (x, y, k, background_mode, show_image_info) on public.canvas_viewport to authenticated;

-- 整图保存走这一个 RPC，不要在应用层拆成多次 REST 调用。
-- revision 守卫沿用 save_canvas_state 的单调语义：调用方传新 revision，
-- 返回行的 revision 与传入值不一致即表示冲突（应用层抛 canvas_revision_conflict）。
create or replace function public.save_canvas_projection(
    target_project_id uuid,
    target_revision bigint,
    next_nodes jsonb,
    next_edges jsonb,
    next_viewport jsonb
)
returns setof public.canvas_workspaces
language plpgsql
security invoker
set search_path = ''
as $$
declare
    target_canvas_id uuid;
begin
    if jsonb_typeof(next_nodes) <> 'array' or jsonb_typeof(next_edges) <> 'array' then
        raise exception 'invalid_projection' using errcode = '22023';
    end if;

    select w.id into target_canvas_id
    from public.canvas_workspaces w
    where w.project_id = target_project_id and target_revision > w.revision;

    -- revision 过期：不写任何东西，把当前行原样返回给调用方比对。
    if target_canvas_id is null then
        return query select w.* from public.canvas_workspaces w where w.project_id = target_project_id;
        return;
    end if;

    insert into public.canvas_nodes
        (project_id, canvas_id, client_node_id, type, entity_id, x, y, width, height, group_client_id, display_state)
    select
        target_project_id,
        target_canvas_id,
        node->>'clientNodeId',
        node->>'type',
        nullif(node->>'entityId', '')::uuid,
        coalesce((node->>'x')::double precision, 0),
        coalesce((node->>'y')::double precision, 0),
        coalesce((node->>'width')::double precision, 0),
        coalesce((node->>'height')::double precision, 0),
        nullif(node->>'groupClientId', ''),
        coalesce(node->'displayState', '{}'::jsonb)
    from jsonb_array_elements(next_nodes) as node
    on conflict (canvas_id, client_node_id) do update set
        type = excluded.type,
        entity_id = excluded.entity_id,
        x = excluded.x,
        y = excluded.y,
        width = excluded.width,
        height = excluded.height,
        group_client_id = excluded.group_client_id,
        display_state = excluded.display_state;

    delete from public.canvas_nodes n
    where n.canvas_id = target_canvas_id
      and n.client_node_id not in (
          select node->>'clientNodeId' from jsonb_array_elements(next_nodes) as node
      );

    -- 边按客户端 id 解析到节点行；指向不存在节点的边直接丢弃。
    insert into public.canvas_edges
        (project_id, canvas_id, client_edge_id, source_node_id, target_node_id, relation_type)
    select
        target_project_id,
        target_canvas_id,
        edge->>'clientEdgeId',
        source_node.id,
        target_node.id,
        nullif(edge->>'relationType', '')
    from jsonb_array_elements(next_edges) as edge
    join public.canvas_nodes source_node
        on source_node.canvas_id = target_canvas_id
       and source_node.client_node_id = edge->>'sourceClientNodeId'
    join public.canvas_nodes target_node
        on target_node.canvas_id = target_canvas_id
       and target_node.client_node_id = edge->>'targetClientNodeId'
    on conflict (canvas_id, client_edge_id) do update set
        source_node_id = excluded.source_node_id,
        target_node_id = excluded.target_node_id,
        relation_type = excluded.relation_type;

    delete from public.canvas_edges e
    where e.canvas_id = target_canvas_id
      and e.client_edge_id not in (
          select edge->>'clientEdgeId' from jsonb_array_elements(next_edges) as edge
      );

    if jsonb_typeof(next_viewport) = 'object' then
        insert into public.canvas_viewport
            (canvas_id, project_id, x, y, k, background_mode, show_image_info)
        values (
            target_canvas_id,
            target_project_id,
            coalesce((next_viewport->>'x')::double precision, 0),
            coalesce((next_viewport->>'y')::double precision, 0),
            coalesce((next_viewport->>'k')::double precision, 1),
            nullif(next_viewport->>'backgroundMode', ''),
            coalesce((next_viewport->>'showImageInfo')::boolean, false)
        )
        on conflict (canvas_id) do update set
            x = excluded.x,
            y = excluded.y,
            k = excluded.k,
            background_mode = excluded.background_mode,
            show_image_info = excluded.show_image_info;
    end if;

    return query
    update public.canvas_workspaces w
    set revision = target_revision
    where w.id = target_canvas_id
    returning w.*;
end;
$$;

revoke execute on function public.save_canvas_projection(uuid, bigint, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_canvas_projection(uuid, bigint, jsonb, jsonb, jsonb) to authenticated;
