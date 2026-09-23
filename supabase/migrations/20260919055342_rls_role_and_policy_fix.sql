GRANT coresearch_app TO postgres;

DROP POLICY IF EXISTS coresearch_app_scope ON projects;
DROP POLICY IF EXISTS coresearch_app_scope ON project_members;

CREATE POLICY coresearch_app_select ON projects FOR SELECT TO coresearch_app USING (owner_user_id = current_setting('app.current_user_id')::uuid OR id IN (SELECT project_id FROM project_members WHERE user_id = current_setting('app.current_user_id')::uuid));
CREATE POLICY coresearch_app_insert ON projects FOR INSERT TO coresearch_app WITH CHECK (owner_user_id = current_setting('app.current_user_id')::uuid);
CREATE POLICY coresearch_app_update ON projects FOR UPDATE TO coresearch_app USING (id IN (SELECT project_id FROM project_members WHERE user_id = current_setting('app.current_user_id')::uuid));
CREATE POLICY coresearch_app_delete ON projects FOR DELETE TO coresearch_app USING (id IN (SELECT project_id FROM project_members WHERE user_id = current_setting('app.current_user_id')::uuid));

CREATE POLICY coresearch_app_select ON project_members FOR SELECT TO coresearch_app USING (user_id = current_setting('app.current_user_id')::uuid);
CREATE POLICY coresearch_app_insert ON project_members FOR INSERT TO coresearch_app WITH CHECK (user_id = current_setting('app.current_user_id')::uuid AND project_id IN (SELECT id FROM projects WHERE owner_user_id = current_setting('app.current_user_id')::uuid));
CREATE POLICY coresearch_app_delete ON project_members FOR DELETE TO coresearch_app USING (user_id = current_setting('app.current_user_id')::uuid);

CREATE OR REPLACE FUNCTION public.canvas_visible_to_auth(cid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM canvases c JOIN project_members pm ON pm.project_id = c.project_id WHERE c.id = cid AND pm.user_id = auth.uid()); $$;
REVOKE ALL ON FUNCTION public.canvas_visible_to_auth(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.canvas_visible_to_auth(uuid) TO authenticated;

DROP POLICY IF EXISTS authenticated_realtime_scope ON canvas_deltas;
CREATE POLICY authenticated_realtime_scope ON canvas_deltas FOR SELECT TO authenticated USING (public.canvas_visible_to_auth(canvas_id));
