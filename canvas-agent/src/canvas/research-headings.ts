export const EMPTY_SECTION_PLACEHOLDER = "<!-- 在此补充；未知内容保留为空 -->";

export const RESEARCH_DOCUMENT_SECTIONS = {
    seed: ["原始输入", "当前主题理解", "相关概念", "待澄清的问题"],
    direction: ["研究范围", "包含与排除", "研究脉络", "子方向", "问题线索", "代表性研究与来源", "检索覆盖与待核查项"],
    research_question: ["研究问题", "对象与条件", "已有处理", "尚不确定的部分", "来源与核查范围"],
    problem: ["问题表述", "为什么重要", "源自哪些研究问题", "范围与非目标", "现有方法的不足", "证据与待核查项"],
    hypothesis: ["机制主张", "成立条件", "可检验预测", "证伪条件", "替代解释", "支持与反对证据"],
    approach: ["总体策略", "对应的假设与预测", "候选策略比较", "取舍与限制", "待设计的方法"],
    method: ["对应的主张", "输入与数据", "实施步骤", "输出", "基线与消融", "实现状态与限制", "对应的评价方案"],
    evaluation: ["主张与指标对应", "主要与次要指标", "数据与基线", "实验条件", "失败判据", "成本与泛化", "计划和已有结果"],
    idea: ["研究概述", "上游对象与用户决定", "问题与机制", "方法与验证", "与最近邻工作的差异", "证据缺口", "风险与下一步"],
} as const;

export type ResearchHeadingType = keyof typeof RESEARCH_DOCUMENT_SECTIONS;

export function isResearchHeadingType(type: string): type is ResearchHeadingType {
    return Object.prototype.hasOwnProperty.call(RESEARCH_DOCUMENT_SECTIONS, type);
}

export function researchDocumentSections(type: string): readonly string[] {
    return isResearchHeadingType(type) ? RESEARCH_DOCUMENT_SECTIONS[type] : [];
}

export function parseMarkdownHeadings(markdown: string): string[] {
    const headings: string[] = [];
    const seen = new Set<string>();
    for (const match of markdown.matchAll(/^##\s+(.+?)\s*$/gm)) {
        const title = match[1].trim();
        if (!title || seen.has(title)) continue;
        seen.add(title);
        headings.push(title);
    }
    return headings;
}

export function missingAuthoritativeHeadings(markdown: string, type: string): string[] {
    const existing = new Set(parseMarkdownHeadings(markdown));
    return researchDocumentSections(type).filter((heading) => !existing.has(heading));
}

export function researchDocumentSkeleton(type: string, title: string): string {
    const sections = researchDocumentSections(type);
    const heading = title.trim() || type;
    const body = sections.map((section) => `## ${section}\n\n${EMPTY_SECTION_PLACEHOLDER}`).join("\n\n");
    return `# ${heading}\n\n${body}\n`;
}

export function appendMissingAuthoritativeHeadings(markdown: string, type: string, title = ""): string {
    const missing = missingAuthoritativeHeadings(markdown, type);
    if (!missing.length) return markdown;
    const source = markdown.trim();
    const prefix = source || (title.trim() ? `# ${title.trim()}` : "");
    const blocks = missing.map((section) => `## ${section}\n\n${EMPTY_SECTION_PLACEHOLDER}`).join("\n\n");
    return `${prefix}${prefix ? "\n\n" : ""}${blocks}\n`;
}

export function isDocumentSkeleton(markdown: string | undefined | null): boolean {
    if (!markdown?.trim()) return true;
    return !markdown
        .replace(/^#\s+.*$/gm, "")
        .replace(/^##\s+.*$/gm, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .trim();
}
