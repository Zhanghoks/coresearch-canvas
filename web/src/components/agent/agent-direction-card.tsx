import { Compass } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { RESEARCH_DIRECTION_MIME, type ResearchDirectionCard } from "@/lib/canvas/research-direction-cards";

export function AgentDirectionCard({ card, theme }: { card: ResearchDirectionCard; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const { t } = useTranslation();
    return (
        <div
            draggable
            className="my-2 cursor-grab rounded-xl border px-3 py-2 active:cursor-grabbing"
            style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}
            onDragStart={(event) => {
                event.dataTransfer.setData(RESEARCH_DIRECTION_MIME, JSON.stringify(card));
                event.dataTransfer.setData("text/plain", card.title);
                event.dataTransfer.effectAllowed = "copy";
            }}
        >
            <div className="flex min-w-0 items-center gap-2">
                <Compass className="size-3.5 shrink-0" style={{ color: theme.node.placeholder }} />
                <span className="shrink-0 text-[11px]" style={{ color: theme.node.placeholder }}>{t(card.kind === "thread" ? "agent.direction.thread" : "agent.direction.kind", { index: card.index })}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{card.title}</span>
            </div>
            {card.axis ? <div className="mt-1 truncate pl-5 text-xs" style={{ color: theme.node.muted }}>{card.axis}</div> : null}
            {card.kind === "thread" && card.bullets?.length ? (
                <>
                    {card.lead ? <div className="mt-1 line-clamp-3 pl-5 text-xs leading-4" style={{ color: theme.node.muted }}>{card.lead}</div> : null}
                    <ul className="mt-1 list-disc space-y-1 pl-9 text-xs leading-4" style={{ color: theme.node.muted }}>
                        {card.bullets.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
                    </ul>
                </>
            ) : card.summary ? <div className={card.kind === "thread" ? "mt-1 pl-5 text-xs leading-5" : "mt-1 line-clamp-3 pl-5 text-xs leading-4"} style={{ color: theme.node.muted }}>{card.summary}</div> : null}
            <div className="mt-1 truncate pl-5 text-[11px]" style={{ color: theme.node.placeholder }}>{t("agent.source.drag")}</div>
        </div>
    );
}
