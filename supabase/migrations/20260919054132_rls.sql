DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'coresearch_app') THEN
    CREATE ROLE coresearch_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO coresearch_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO coresearch_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO coresearch_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO coresearch_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO coresearch_app;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_threads FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE research_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_entities FORCE ROW LEVEL SECURITY;
ALTER TABLE research_entity_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_entity_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE research_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_relations FORCE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals FORCE ROW LEVEL SECURITY;
ALTER TABLE canvases ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvases FORCE ROW LEVEL SECURITY;
ALTER TABLE canvas_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_nodes FORCE ROW LEVEL SECURITY;
ALTER TABLE canvas_layout ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_layout FORCE ROW LEVEL SECURITY;
ALTER TABLE canvas_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_edges FORCE ROW LEVEL SECURITY;
ALTER TABLE canvas_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_projections FORCE ROW LEVEL SECURITY;
ALTER TABLE canvas_deltas ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_deltas FORCE ROW LEVEL SECURITY;

CREATE POLICY coresearch_app_scope ON projects FOR ALL TO coresearch_app USING (id IN (SELECT project_id FROM project_members WHERE user_id = current_setting('app.current_user_id')::uuid));
CREATE POLICY coresearch_app_scope ON project_members FOR ALL TO coresearch_app USING (user_id = current_setting('app.current_user_id')::uuid);
CREATE POLICY coresearch_app_scope ON agent_threads FOR ALL TO coresearch_app USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = current_setting('app.current_user_id')::uuid));
CREATE POLICY coresearch_app_scope ON agent_messages FOR ALL TO coresearch_app USING (thread_id IN (SELECT id FROM agent_threads WHERE project_id IN (SELECT project_id FROM project_members WHERE user_id = current_setting('app.current_user_id')::uuid)));
CREATE POLICY coresearch_app_scope ON agent_runs FOR ALL TO coresearch_app USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = current_setting('app.current_user_id')::uuid));
CREATE POLICY coresearch_app_scope ON research_entities FOR ALL TO coresearch_app USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = current_setting('app.current_user_id')::uuid));
CREATE POLICY coresearch_app_scope ON research_entity_revisions FOR ALL TO coresearch_app USING (entity_id IN (SELECT id FROM research_entities WHERE project_id IN (SELECT project_id FROM project_members WHERE user_id = current_setting('app.current_user_id')::uuid)));
CREATE POLICY coresearch_app_scope ON research_relations FOR ALL TO coresearch_app USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = current_setting('app.current_user_id')::uuid));
CREATE POLICY coresearch_app_scope ON proposals FOR ALL TO coresearch_app USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = current_setting('app.current_user_id')::uuid));
CREATE POLICY coresearch_app_scope ON canvases FOR ALL TO coresearch_app USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = current_setting('app.current_user_id')::uuid));
CREATE POLICY coresearch_app_scope ON canvas_nodes FOR ALL TO coresearch_app USING (canvas_id IN (SELECT id FROM canvases WHERE project_id IN (SELECT project_id FROM project_members WHERE user_id = current_setting('app.current_user_id')::uuid)));
CREATE POLICY coresearch_app_scope ON canvas_layout FOR ALL TO coresearch_app USING (node_id IN (SELECT id FROM canvas_nodes WHERE canvas_id IN (SELECT id FROM canvases WHERE project_id IN (SELECT project_id FROM project_members WHERE user_id = current_setting('app.current_user_id')::uuid))));
CREATE POLICY coresearch_app_scope ON canvas_edges FOR ALL TO coresearch_app USING (canvas_id IN (SELECT id FROM canvases WHERE project_id IN (SELECT project_id FROM project_members WHERE user_id = current_setting('app.current_user_id')::uuid)));
CREATE POLICY coresearch_app_scope ON canvas_projections FOR ALL TO coresearch_app USING (canvas_id IN (SELECT id FROM canvases WHERE project_id IN (SELECT project_id FROM project_members WHERE user_id = current_setting('app.current_user_id')::uuid)));
CREATE POLICY coresearch_app_scope ON canvas_deltas FOR ALL TO coresearch_app USING (canvas_id IN (SELECT id FROM canvases WHERE project_id IN (SELECT project_id FROM project_members WHERE user_id = current_setting('app.current_user_id')::uuid)));

CREATE POLICY authenticated_realtime_scope ON canvas_deltas FOR SELECT TO authenticated USING (canvas_id IN (SELECT c.id FROM canvases c JOIN project_members pm ON pm.project_id = c.project_id WHERE pm.user_id = auth.uid()));
GRANT SELECT ON canvas_deltas TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE canvas_deltas;
