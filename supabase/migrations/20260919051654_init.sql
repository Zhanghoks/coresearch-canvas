-- CoResearch SaaS — initial schema.
-- Source: docs/spec/01-database-schema.md. Agent Worker tables are created
-- before Research Domain because research_entities.source_candidate_id
-- references agent_messages.

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  plan text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE project_members (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE agent_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  pi_cwd text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_messages (
  id uuid PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  parent_id uuid NULL,
  entry_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id),
  status text NOT NULL DEFAULT 'queued',
  lease_owner text NULL,
  lease_expires_at timestamptz NULL,
  heartbeat_at timestamptz NULL,
  cancel_requested boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  ended_at timestamptz NULL
);

CREATE TYPE research_entity_kind AS ENUM (
  'seed', 'direction', 'phase', 'focus', 'problem', 'claim', 'hypothesis',
  'prediction', 'work', 'question', 'probe', 'requirement', 'approach',
  'operation', 'component',
  'method', 'evaluation'
);

CREATE TABLE research_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_kind research_entity_kind NOT NULL,
  current_revision int NOT NULL DEFAULT 1,
  content_hash text NOT NULL,
  status text NOT NULL,
  origin text NOT NULL,
  confirmed boolean NOT NULL DEFAULT false,
  stale text NULL,
  summary text,
  payload jsonb NOT NULL DEFAULT '{}',
  source_candidate_id uuid NULL,
  branch_id uuid NULL,
  sequence_index int NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, source_candidate_id)
);

ALTER TABLE research_entities
  ADD CONSTRAINT research_entities_source_candidate_fk
  FOREIGN KEY (source_candidate_id) REFERENCES agent_messages(id);

CREATE TABLE research_entity_revisions (
  entity_id uuid NOT NULL REFERENCES research_entities(id) ON DELETE CASCADE,
  revision int NOT NULL,
  payload jsonb NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  PRIMARY KEY (entity_id, revision)
);

CREATE TABLE research_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_entity_id uuid NOT NULL REFERENCES research_entities(id) ON DELETE CASCADE,
  to_entity_id uuid NOT NULL REFERENCES research_entities(id) ON DELETE CASCADE,
  relation_kind text NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]',
  basis text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES research_entities(id) ON DELETE CASCADE,
  base_state_revision int NOT NULL,
  kind text NOT NULL,
  changes jsonb NOT NULL,
  rationale text,
  anchor_ids uuid[] NOT NULL DEFAULT '{}',
  alternative_group_id uuid NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE canvases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Main Canvas',
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE canvas_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id uuid NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  node_type text NOT NULL,
  parent_node_id uuid NULL REFERENCES canvas_nodes(id) ON DELETE SET NULL,
  native_data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE canvas_layout (
  node_id uuid PRIMARY KEY REFERENCES canvas_nodes(id) ON DELETE CASCADE,
  x double precision NOT NULL,
  y double precision NOT NULL,
  width double precision,
  height double precision,
  z_order int NOT NULL DEFAULT 0,
  pinned boolean NOT NULL DEFAULT false,
  collapsed boolean NOT NULL DEFAULT false,
  frame_column int NULL,
  frame_row int NULL
);

CREATE TABLE canvas_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id uuid NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
  edge_type text NOT NULL DEFAULT 'visual',
  created_by text NOT NULL
);

CREATE TABLE canvas_projections (
  node_id uuid PRIMARY KEY REFERENCES canvas_nodes(id) ON DELETE CASCADE,
  canvas_id uuid NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES research_entities(id) ON DELETE CASCADE,
  revision_policy text NOT NULL DEFAULT 'latest',
  pinned_revision int NULL,
  projector_version int NOT NULL DEFAULT 1
);

CREATE TABLE canvas_deltas (
  id bigserial PRIMARY KEY,
  canvas_id uuid NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  from_version bigint NOT NULL,
  to_version bigint NOT NULL,
  deltas jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON research_entities (project_id, entity_kind);
CREATE INDEX ON research_relations (project_id, from_entity_id);
CREATE INDEX ON research_relations (project_id, to_entity_id);
CREATE INDEX ON proposals (entity_id) WHERE status = 'pending';
CREATE INDEX ON canvas_nodes (canvas_id, node_type);
CREATE INDEX ON canvas_nodes (parent_node_id);
CREATE INDEX ON canvas_deltas (canvas_id, to_version);
CREATE INDEX ON agent_messages (thread_id, created_at);
CREATE INDEX ON agent_runs (status, lease_expires_at) WHERE status IN ('queued', 'running');
