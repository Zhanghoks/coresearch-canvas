import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const skillsDir = path.join(fileURLToPath(new URL("../../skills", import.meta.url)));
const expected = ["research-flow", "research-workspace", "seed", "direction", "research-question", "problem", "hypothesis", "approach", "method", "evaluation", "idea"];

test("research node skill repository covers every flow node", () => {
    const names = fs.readdirSync(skillsDir).filter((name) => fs.existsSync(path.join(skillsDir, name, "SKILL.md")));
    for (const name of expected) {
        assert.ok(names.includes(name), `missing skill ${name}`);
        const text = fs.readFileSync(path.join(skillsDir, name, "SKILL.md"), "utf8");
        assert.match(text, new RegExp(`^---\\nname: ${name}\\n`));
        if (!new Set(["research-flow", "research-workspace"]).has(name)) assert.match(text, /research_workflow_advance/);
    }
    const workspaceSkill = fs.readFileSync(path.join(skillsDir, "research-workspace", "SKILL.md"), "utf8");
    assert.match(workspaceSkill, /research_artifact_write/);
    assert.match(fs.readFileSync(path.join(skillsDir, "research-workspace", "references", "artifact-contract.md"), "utf8"), /evaluation-matrix/);
});
