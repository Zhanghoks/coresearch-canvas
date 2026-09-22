export const RESEARCH_DIRECTION_MIME = "application/x-coresearch-direction";

export type ResearchDirectionCard = {
    key: string;
    index: string;
    title: string;
    axis?: string;
    summary?: string;
    lead?: string;
    bullets?: string[];
    document: string;
    kind?: "direction" | "thread";
};

const DIRECTION = /\*\*D(\d+)\.\s*([^*]+?)\*\*[ \t]*(?:[—–-][ \t]*轴[:：][ \t]*([^\n]+))?[ \t]*\n((?:[ \t]*[-*][ \t]+[^\n]+\n?)+)/g;
const THREAD = /\*\*脉络\s*([A-Za-z0-9]+)[：:．.]\s*([^*\n]+?)\*\*[ \t]*\n([\s\S]*?)(?=\n\*\*脉络\s|\n#{1,3} |\n---\n|\n\*\*RQ\d|\s*$)/g;

export type DirectionSegment =
    | { type: "prose"; text: string }
    | { type: "direction"; card: ResearchDirectionCard };

export function splitDirectionCards(text: string): DirectionSegment[] {
    const hits = [...directionHits(text), ...threadHits(text)].sort((a, b) => a.index - b.index);
    const segments: DirectionSegment[] = [];
    let last = 0;
    for (const hit of hits) {
        if (hit.index < last) continue;
        const prose = text.slice(last, hit.index);
        if (prose.trim()) segments.push({ type: "prose", text: prose });
        segments.push({ type: "direction", card: hit.card });
        last = hit.index + hit.length;
    }
    const rest = text.slice(last);
    if (rest.trim() || !segments.length) segments.push({ type: "prose", text: rest });
    return segments;
}

function directionHits(text: string) {
    return [...text.matchAll(DIRECTION)].flatMap((match) => {
        const card = directionFromMatch(match);
        return card ? [{ index: match.index ?? 0, length: match[0].length, card }] : [];
    });
}

function threadHits(text: string) {
    return [...text.matchAll(THREAD)].flatMap((match) => {
        const card = threadFromMatch(match);
        return card ? [{ index: match.index ?? 0, length: match[0].length, card }] : [];
    });
}

function directionFromMatch(match: RegExpMatchArray): ResearchDirectionCard | null {
    const title = plain(match[2]);
    if (!title) return null;
    const bullets = bulletLines(match[4]);
    const axis = match[3]?.trim();
    const summary = bulletValue(match[4], "核心判断");
    const document = [axis ? `轴：${axis}` : "", match[4].trim()].filter(Boolean).join("\n\n");
    return { key: `D${match[1]}:${title}`, index: match[1], title, axis, summary, bullets, document, kind: "direction" };
}

function threadFromMatch(match: RegExpMatchArray): ResearchDirectionCard | null {
    const title = plain(match[2]);
    if (!title) return null;
    const body = match[3].trim();
    const explicit = bulletLines(body);
    const prose = body.split("\n").map((line) => line.trim()).filter((line) => line && !/^[-*]\s+/.test(line)).join("\n");
    const sentences = plain(prose).split(/(?<=。)/).map((line) => line.trim()).filter((line) => line.length > 8);
    const bullets = explicit.length ? explicit : sentences.length > 1 ? sentences : [];
    const summary = bulletValue(body, "主张") || (bullets.length ? bullets[0] : plain(prose));
    const lead = explicit.length ? plain(prose) : "";
    const document = bullets.length ? bullets.map((line) => `- ${line}`).join("\n") : plain(body);
    return { key: `T${match[1]}:${title}`, index: match[1], title, summary, lead, bullets, document, kind: "thread" };
}

function bulletLines(text: string) {
    return text.split("\n").flatMap((line) => {
        const match = line.match(/^\s*[-*]\s+(.+)/);
        return match ? [plain(match[1])] : [];
    });
}

function bulletValue(lines: string, label: string) {
    const match = lines.match(new RegExp(`^\\s*[-*]\\s*${label}[:：]\\s*(.+)$`, "m"));
    return match ? plain(match[1]) : undefined;
}

function plain(text: string) {
    return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*\n]+)\*/g, "$1").replace(/`([^`]+)`/g, "$1").trim();
}
