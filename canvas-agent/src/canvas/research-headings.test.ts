import assert from "node:assert/strict";
import test from "node:test";

import {
    appendMissingAuthoritativeHeadings,
    isDocumentSkeleton,
    missingAuthoritativeHeadings,
    parseMarkdownHeadings,
    RESEARCH_DOCUMENT_SECTIONS,
    researchDocumentSkeleton,
} from "./research-headings.js";

test("Direction headings include retrieval coverage", () => {
    assert.ok(RESEARCH_DOCUMENT_SECTIONS.direction.includes("检索覆盖与待核查项"));
    assert.equal(
        RESEARCH_DOCUMENT_SECTIONS.direction.includes("待核查项"),
        false,
    );
});

test("skeleton is detected as empty even with placeholders", () => {
    const markdown = researchDocumentSkeleton("seed", "兴趣");
    assert.equal(isDocumentSkeleton(markdown), true);
    assert.deepEqual(parseMarkdownHeadings(markdown), [...RESEARCH_DOCUMENT_SECTIONS.seed]);
    assert.equal(isDocumentSkeleton("# 兴趣\n\n## 原始输入\n\n已经写过的内容"), false);
});

test("append only adds missing official headings and keeps custom ones", () => {
    const markdown = "# 方向一\n\n## 边界\n\n自定义说明\n";
    const next = appendMissingAuthoritativeHeadings(markdown, "direction", "方向一");
    assert.match(next, /## 边界/);
    assert.match(next, /自定义说明/);
    assert.deepEqual(missingAuthoritativeHeadings(next, "direction"), []);
    assert.match(next, /## 检索覆盖与待核查项/);
});
