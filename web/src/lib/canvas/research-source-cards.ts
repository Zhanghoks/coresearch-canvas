export const RESEARCH_SOURCE_MIME = "application/x-coresearch-source";

export type ResearchSourceCard = {
    kind: "paper" | "repo";
    title: string;
    url: string;
    summary?: string;
    authors?: string;
};

const FENCE = /```research-source\s*\n?([\s\S]*?)```/g;
const LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)<]+)/g;

export function splitResearchSources(text: string) {
    const sources: ResearchSourceCard[] = [];
    let prose = text;
    const open = prose.lastIndexOf("```research-source");
    if (open >= 0 && prose.indexOf("```", open + 3) < 0) prose = prose.slice(0, open);
    prose = prose.replace(FENCE, (_, body: string) => {
        body.split("\n").forEach((line) => {
            const card = parseSourceLine(line);
            if (card) sources.push(card);
        });
        return "";
    });
    if (!sources.length) extractSourceLinks(text).forEach((card) => sources.push(card));
    return { prose: prose.replace(/\n{3,}/g, "\n\n").trim(), sources: dedupeSources(sources) };
}

function parseSourceLine(line: string): ResearchSourceCard | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) return null;
    try {
        const value = JSON.parse(trimmed) as Record<string, unknown>;
        const kind = value.kind === "repo" ? "repo" : value.kind === "paper" ? "paper" : null;
        const url = cleanUrl(typeof value.url === "string" ? value.url : "");
        const title = typeof value.title === "string" ? value.title.trim() : "";
        if (!kind || !url || !title) return null;
        return { kind, title, url, summary: optionalText(value.summary), authors: optionalText(value.authors) };
    } catch {
        return null;
    }
}

function extractSourceLinks(text: string) {
    const cards: ResearchSourceCard[] = [];
    for (const match of text.matchAll(LINK)) {
        const label = match[1]?.trim();
        const url = cleanUrl(match[2] || match[3] || "");
        const card = cardFromUrl(url, label && !/^https?:\/\//.test(label) ? label : "");
        if (card) cards.push(card);
    }
    return cards;
}

function cardFromUrl(url: string, label: string): ResearchSourceCard | null {
    const arxiv = url.match(/^https:\/\/arxiv\.org\/(?:abs|pdf)\/([0-9]+\.[0-9]+)(?:v\d+)?/i);
    if (arxiv) return { kind: "paper", title: label || `arXiv:${arxiv[1]}`, url: `https://arxiv.org/abs/${arxiv[1]}` };
    if (/^https:\/\/(?:aclanthology\.org|doi\.org|www\.semanticscholar\.org)\//i.test(url)) {
        const slug = decodeURIComponent(url.split("/").filter(Boolean).pop() || url);
        return { kind: "paper", title: label || slug, url };
    }
    const repo = url.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)/i);
    if (!repo || repo[2] === "issues" || repo[2] === "pull") return null;
    return { kind: "repo", title: label || `${repo[1]}/${repo[2]}`, url: `https://github.com/${repo[1]}/${repo[2]}` };
}

function dedupeSources(sources: ResearchSourceCard[]) {
    const seen = new Set<string>();
    return sources.filter((item) => {
        const key = item.url.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function cleanUrl(url: string) {
    return url.trim().replace(/[.,;]+$/, "");
}

function optionalText(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** 论文落地页换成可直接预览的 PDF 地址；认不出来时返回空串。 */
export function paperPdfUrl(url: string) {
    const value = url.trim();
    const arxiv = value.match(/^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\/([0-9]+\.[0-9]+(?:v\d+)?)/i);
    if (arxiv) return `https://arxiv.org/pdf/${arxiv[1]}`;
    const acl = value.match(/^https?:\/\/aclanthology\.org\/(\d{4}\.[a-z0-9-]+\.\d+|[A-Z]\d{2}-\d{4})(?:\.pdf)?\/?(?:[?#].*)?$/i);
    if (acl) return `https://aclanthology.org/${acl[1]}.pdf`;
    const openReview = value.match(/^https?:\/\/openreview\.net\/(?:forum|pdf)\?id=([^&#]+)/i);
    if (openReview) return `https://openreview.net/pdf?id=${openReview[1]}`;
    return /\.pdf($|[?#])/i.test(value) ? value : "";
}

export function researchSourceNodeType(card: ResearchSourceCard) {
    return card.kind === "paper" && paperPdfUrl(card.url) ? "pdf" : "web";
}
