import { expect, test } from "bun:test";

import { paperPdfUrl, researchSourceNodeType } from "../src/lib/canvas/research-source-cards";

test("paperPdfUrl maps common paper landing pages to previewable PDFs", () => {
    expect(paperPdfUrl("https://aclanthology.org/2026.acl-long.1563/")).toBe("https://aclanthology.org/2026.acl-long.1563.pdf");
    expect(paperPdfUrl("https://aclanthology.org/2026.acl-long.1563.pdf")).toBe("https://aclanthology.org/2026.acl-long.1563.pdf");
    expect(paperPdfUrl("https://aclanthology.org/P19-1001")).toBe("https://aclanthology.org/P19-1001.pdf");
    expect(paperPdfUrl("https://arxiv.org/abs/2501.01234v2")).toBe("https://arxiv.org/pdf/2501.01234v2");
    expect(paperPdfUrl("https://openreview.net/forum?id=abc123")).toBe("https://openreview.net/pdf?id=abc123");
    expect(paperPdfUrl("https://example.com/paper.pdf?download=1")).toBe("https://example.com/paper.pdf?download=1");
});

test("paperPdfUrl ignores pages that are not papers", () => {
    expect(paperPdfUrl("https://aclanthology.org/events/acl-2026/")).toBe("");
    expect(paperPdfUrl("https://github.com/org/repo")).toBe("");
});

test("papers with a derivable PDF become pdf nodes, others web nodes", () => {
    expect(researchSourceNodeType({ kind: "paper", title: "ACL", url: "https://aclanthology.org/2026.acl-long.1563/" })).toBe("pdf");
    expect(researchSourceNodeType({ kind: "paper", title: "S2", url: "https://www.semanticscholar.org/paper/abc" })).toBe("web");
    expect(researchSourceNodeType({ kind: "repo", title: "repo", url: "https://github.com/org/repo" })).toBe("web");
});
