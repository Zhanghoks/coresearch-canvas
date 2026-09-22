<!-- CoResearch managed skill resource -->
# Canvas bridge

Paper files live in workspace `paper/`. Canvas Idea remains the research commitment.

1. `canvas_get_state` (or selection) to read the Idea and upstream nodes.
2. Write LaTeX and audits with `bash` + paper scripts. Do not add Pi tools.
3. Literature search uses `paper-lit` and bash scripts under `skills/paper-lit/scripts/`. Existing `web_search` / `fetch_content` are optional extras. Landing papers on the canvas still follows `research-flow`.
4. User asks to save a plan/audit/draft note: `research-workspace` with `paper-plan` / `paper-audit` / `paper-draft` and real `sourceNodeIds`.
5. Do not `research_workflow_advance` from a paper skill. Changing Problem/Method/Idea goes back to the node Skill.
