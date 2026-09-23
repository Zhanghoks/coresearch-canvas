-- 画布 revision 改由服务端分配（乐观锁）。
--
-- 原协议由客户端自选 revision、服务端只在 target > current 时写入：并发请求乱序到达会 409，
-- 而 target == current 时不写入却原样返回当前行，调用方把它当成成功，广播了一份从未保存的快照。
-- 新协议：客户端提交它最后看到的 base_revision，只有等于当前值才写入并 +1，否则 P0409。
-- 快照与结构化投影共用 canvas_workspaces.revision，两边用同一套规则。

create or replace function public.commit_canvas_state(
    target_project_id uuid,
    base_revision bigint,
    next_snapshot jsonb
)
returns setof public.canvas_workspaces
language plpgsql
security invoker
set search_path = ''
as $$
declare
    committed public.canvas_workspaces;
    current_revision bigint;
begin
    if next_snapshot is not null and jsonb_typeof(next_snapshot) <> 'object' then
        raise exception 'invalid_canvas_snapshot' using errcode = '22023';
    end if;

    update public.canvas_workspaces w
    set revision = w.revision + 1,
        snapshot = next_snapshot
    where w.project_id = target_project_id
      and w.revision = base_revision
    returning w.* into committed;

    if found then
        return next committed;
        return;
    end if;

    select w.revision into current_revision from public.canvas_workspaces w where w.project_id = target_project_id;
    -- 行不存在或 RLS 不可见：返回空集，由调用方报 404。
    if current_revision is null then
        return;
    end if;
    raise exception 'canvas_revision_conflict' using errcode = 'P0409', detail = current_revision::text;
end;
$$;

create or replace function public.commit_canvas_projection(
    target_project_id uuid,
    base_revision bigint,
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
    current_revision bigint;
begin
    if jsonb_typeof(next_nodes) <> 'array' or jsonb_typeof(next_edges) <> 'array' then
        raise exception 'invalid_projection' using errcode = '22023';
    end if;

    -- 行锁：并发保存串行化，revision 不会倒退。
    select w.id, w.revision into target_canvas_id, current_revision
    from public.canvas_workspaces w
    where w.project_id = target_project_id
    for update;

    if target_canvas_id is null then
        return;
    end if;
    if current_revision <> base_revision then
        raise exception 'canvas_revision_conflict' using errcode = 'P0409', detail = current_revision::text;
    end if;

    -- 同一 clientNodeId 出现两次时 ON CONFLICT 会在同一语句里改同一行两次（21000），提前拒绝。
    if (select count(*) <> count(distinct node->>'clientNodeId') from jsonb_array_elements(next_nodes) as node)
       or (select count(*) <> count(distinct edge->>'clientEdgeId') from jsonb_array_elements(next_edges) as edge) then
        raise exception 'duplicate_projection_id' using errcode = '22023';
    end if;

    -- entityId 必须属于本 Project；FK 检查不受 RLS 约束，不校验就能挂上别人项目的实体，也能用来探测 UUID 是否存在。
    if exists (
        select 1
        from jsonb_array_elements(next_nodes) as node
        where nullif(node->>'entityId', '') is not null
          and not exists (
              select 1 from public.research_entities e
              where e.id::text = node->>'entityId' and e.project_id = target_project_id
          )
    ) then
        raise exception 'projection_entity_not_in_project' using errcode = '22023';
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
    set revision = w.revision + 1
    where w.id = target_canvas_id
    returning w.*;
end;
$$;

revoke execute on function public.commit_canvas_state(uuid, bigint, jsonb) from public, anon;
grant execute on function public.commit_canvas_state(uuid, bigint, jsonb) to authenticated;
revoke execute on function public.commit_canvas_projection(uuid, bigint, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.commit_canvas_projection(uuid, bigint, jsonb, jsonb, jsonb) to authenticated;

drop function if exists public.save_canvas_state(uuid, bigint, jsonb);
drop function if exists public.save_canvas_projection(uuid, bigint, jsonb, jsonb, jsonb);
