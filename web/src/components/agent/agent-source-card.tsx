import { FileText, FolderGit2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { RESEARCH_SOURCE_MIME, type ResearchSourceCard } from "@/lib/canvas/research-source-cards";

export function AgentSourceCards({ sources, theme }: { sources: ResearchSourceCard[]; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    if (!sources.length) return null;
    return (
        <div className="mt-2 flex flex-col gap-1.5">
            {sources.map((item) => <AgentSourceCard key={item.url} source={item} theme={theme} />)}
        </div>
    );
}

function AgentSourceCard({ source, theme }: { source: ResearchSourceCard; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const { t } = useTranslation();
    const Icon = source.kind === "repo" ? FolderGit2 : FileText;
    return (
        <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            draggable
            className="block cursor-grab rounded-xl border px-3 py-2 active:cursor-grabbing"
            style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}
            onDragStart={(event) => {
                event.dataTransfer.setData(RESEARCH_SOURCE_MIME, JSON.stringify(source));
                event.dataTransfer.setData("text/plain", source.url);
                event.dataTransfer.effectAllowed = "copy";
            }}
        >
            <div className="flex min-w-0 items-center gap-2">
                <Icon className="size-3.5 shrink-0" style={{ color: theme.node.placeholder }} />
                <span className="shrink-0 text-[11px]" style={{ color: theme.node.placeholder }}>{t(source.kind === "repo" ? "agent.source.repo" : "agent.source.paper")}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{source.title}</span>
            </div>
            {source.authors ? <div className="mt-1 truncate pl-5 text-xs" style={{ color: theme.node.muted }}>{source.authors}</div> : null}
            {source.summary ? <div className="mt-1 line-clamp-2 pl-5 text-xs leading-4" style={{ color: theme.node.muted }}>{source.summary}</div> : null}
            <div className="mt-1 truncate pl-5 text-[11px]" style={{ color: theme.node.placeholder }}>{t("agent.source.drag")}</div>
        </a>
    );
}
