import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Bot, ChevronDown, Copy, Ellipsis, FolderOpen, Home, Menu, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Settings2, Sparkles, Trash2, X } from "lucide-react";
import { App, Dropdown, Tooltip } from "antd";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { AppConfigModal } from "@/components/layout/app-config-modal";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/use-agent-store";
import { useCanvasStore, workspaceCanvasProjects, type CanvasProject } from "@/stores/canvas/use-canvas-store";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";
import { useUserStore } from "@/stores/use-user-store";
import { usesPlatformHostedAgent } from "@/stores/use-user-store";
import { hostedAgentConfigured } from "@/services/api/supabase";

const SIDEBAR_WIDTH_KEY = "app-sidebar-width";
const SIDEBAR_COLLAPSED_KEY = "app-sidebar-collapsed";
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 400;
const SIDEBAR_DEFAULT_WIDTH = 256;
const SIDEBAR_COLLAPSED_WIDTH = 64;
const SIDEBAR_COLLAPSE_THRESHOLD = 160;

function readStoredWidth() {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (!stored) return SIDEBAR_DEFAULT_WIDTH;
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, stored));
}

function persistLayout(width: number, collapsed: boolean) {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
}

const navItemClass = (collapsed: boolean, active?: boolean) =>
    cn(
        "flex items-center rounded-lg text-sm transition",
        collapsed ? "size-10 justify-center" : "h-10 gap-2.5 px-2",
        active ? "bg-stone-200/70 font-medium text-stone-950 dark:bg-stone-800 dark:text-stone-100" : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-900",
    );

function SidebarItem({
    collapsed,
    label,
    active,
    to,
    onClick,
    children,
}: {
    collapsed: boolean;
    label: string;
    active?: boolean;
    to?: string;
    onClick?: () => void;
    children: ReactNode;
}) {
    const inner = (
        <>
            {children}
            {collapsed ? null : <span className="min-w-0 truncate">{label}</span>}
        </>
    );
    const node = to ? (
        <Link to={to} className={navItemClass(collapsed, active)} aria-label={label}>
            {inner}
        </Link>
    ) : (
        <button type="button" onClick={onClick} className={cn(navItemClass(collapsed, active), "text-left")} aria-label={label}>
            {inner}
        </button>
    );
    if (!collapsed) return node;
    return (
        <Tooltip title={label} placement="right">
            {node}
        </Tooltip>
    );
}

async function copyText(value: string) {
    try {
        await navigator.clipboard.writeText(value);
    } catch {
        const input = document.createElement("textarea");
        input.value = value;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.focus();
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        if (!copied) throw new Error("copy");
    }
}

function RecentProjectRow({ project, active }: { project: CanvasProject; active: boolean }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const browserWorkspace = usesPlatformHostedAgent();
    const navigate = useNavigate();
    const cancelRenameRef = useRef(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const renameProject = useCanvasStore((state) => state.renameProject);
    const locateProject = useCanvasStore((state) => state.locateProject);
    const revealProject = useCanvasStore((state) => state.revealProject);
    const editingId = useCanvasUiStore((state) => state.editingProjectId);
    const editingTitle = useCanvasUiStore((state) => state.editingProjectTitle);
    const startEditing = useCanvasUiStore((state) => state.startEditingProject);
    const setEditingTitle = useCanvasUiStore((state) => state.setEditingProjectTitle);
    const stopEditing = useCanvasUiStore((state) => state.stopEditingProject);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const editing = editingId === project.id;
    const saveTitle = () => {
        if (cancelRenameRef.current) {
            cancelRenameRef.current = false;
            return;
        }
        renameProject(project.id, editingTitle);
        stopEditing();
    };
    const fail = (error: unknown) => message.error(error instanceof Error ? error.message : t("canvas.project.actionFailed"));
    const menu = {
        items: [
            { key: "rename", icon: <Pencil className="size-4" />, label: t("canvas.project.rename"), onClick: () => startEditing(project.id, project.title) },
            ...(browserWorkspace ? [] : [
                { key: "copy", icon: <Copy className="size-4" />, label: t("canvas.project.copyPath"), onClick: () => void locateProject(project.id).then(copyText).then(() => message.success(t("canvas.project.pathCopied"))).catch((error) => message.error(error instanceof Error && error.message !== "copy" ? error.message : t("canvas.project.actionFailed"))) },
                { key: "reveal", icon: <FolderOpen className="size-4" />, label: t("canvas.project.showInFolder"), onClick: () => void revealProject(project.id).then(() => message.success(t("canvas.project.revealed"))).catch(fail) },
            ]),
            { key: "close", icon: <X className="size-4" />, label: t("canvas.project.close"), disabled: !active, onClick: () => { if (active) navigate("/canvas"); } },
            { type: "divider" as const },
            { key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: t("canvas.project.delete"), onClick: () => setDeleteIds([project.id]) },
        ],
    };

    return (
        <Dropdown trigger={["contextMenu"]} menu={menu} onOpenChange={setMenuOpen}>
            <div className="group relative">
                {editing ? (
                    <input
                        autoFocus
                        value={editingTitle}
                        aria-label={t("canvas.project.rename")}
                        className="h-9 w-full rounded-lg bg-transparent px-3 pr-8 text-sm text-stone-950 outline-none ring-1 ring-stone-300 dark:text-stone-100 dark:ring-stone-600"
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onBlur={saveTitle}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") saveTitle();
                            if (event.key === "Escape") {
                                cancelRenameRef.current = true;
                                stopEditing();
                            }
                        }}
                    />
                ) : (
                    <Link
                        to={`/canvas/${project.id}`}
                        className={cn(
                            "block truncate rounded-lg py-2 pl-3 pr-8 text-sm transition",
                            active ? "bg-stone-200/70 font-medium text-stone-950 dark:bg-stone-800 dark:text-stone-100" : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-900",
                        )}
                    >
                        {project.title}
                    </Link>
                )}
                <Dropdown trigger={["click"]} menu={menu} onOpenChange={setMenuOpen}>
                    <button
                        type="button"
                        aria-label={t("canvas.project.menu")}
                        aria-expanded={menuOpen}
                        className={cn(
                            "absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded-md text-stone-500 transition hover:bg-black/5 hover:text-stone-950 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-stone-100",
                            menuOpen || active ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                        )}
                        onClick={(event) => event.preventDefault()}
                    >
                        <Ellipsis className="size-4" />
                    </button>
                </Dropdown>
            </div>
        </Dropdown>
    );
}

export function AppSidebar() {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [configMenuOpen, setConfigMenuOpen] = useState(false);
    const [projectsExpanded, setProjectsExpanded] = useState(true);
    const [width, setWidth] = useState(() => (typeof window === "undefined" ? SIDEBAR_DEFAULT_WIDTH : readStoredWidth()));
    const [collapsed, setCollapsed] = useState(() => (typeof window === "undefined" ? false : localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1"));
    const [resizing, setResizing] = useState(false);
    const autoConnectRef = useRef(false);
    const agentEnabled = useAgentStore((state) => state.enabled);
    const agentConnected = useAgentStore((state) => state.connected);
    const connectAgent = useAgentStore((state) => state.connectAgent);
    const openAgentPanel = useAgentStore((state) => state.openPanel);
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const hosted = hostedAgentConfigured;
    const signedInUserId = useUserStore((state) => state.user?.id);
    const allProjects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;
    const currentProjectId = pathname.match(/^\/canvas\/([^/]+)/)?.[1];

    const workspaceProjects = useMemo(() => workspaceCanvasProjects(allProjects), [allProjects, signedInUserId]);
    const recentProjects = workspaceProjects.slice(0, 8);

    useEffect(() => {
        if (hosted || autoConnectRef.current || agentEnabled || agentConnected) return;
        autoConnectRef.current = true;
        connectAgent({ silent: true });
    }, [agentConnected, agentEnabled, connectAgent, hosted]);

    const createAndEnter = () => {
        const id = createProject(t("canvas.defaultTitle", { count: workspaceProjects.length + 1 }));
        navigate(`/canvas/${id}`);
    };

    const openAgentInProject = (tab: "skills" | "setup") => {
        openAgentPanel();
        setAgentState({ activeTab: tab });
        if (currentProjectId) return;
        const projectId = recentProjects[0]?.id;
        if (projectId) navigate(`/canvas/${projectId}`);
        else createAndEnter();
    };

    const setCollapsedAndPersist = (next: boolean) => {
        setCollapsed(next);
        persistLayout(width, next);
    };

    const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : width;
        const restoredWidth = width;
        let nextWidth = restoredWidth;
        let nextCollapsed = collapsed;
        const onMove = (moveEvent: PointerEvent) => {
            const proposed = startWidth + moveEvent.clientX - startX;
            if (proposed < SIDEBAR_COLLAPSE_THRESHOLD) {
                nextCollapsed = true;
                nextWidth = restoredWidth;
                setCollapsed(true);
                return;
            }
            nextCollapsed = false;
            nextWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, proposed));
            setCollapsed(false);
            setWidth(nextWidth);
        };
        const onUp = () => {
            persistLayout(nextWidth, nextCollapsed);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            setResizing(false);
        };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        setResizing(true);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    const collapseLabel = collapsed ? t("navigation.expand") : t("navigation.collapse");
    const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : width;

    return (
        <>
            <aside
                className="relative hidden h-full shrink-0 flex-col overflow-hidden border-r border-stone-200 bg-stone-50 py-4 dark:border-stone-800 dark:bg-stone-950 md:flex"
                style={{ width: sidebarWidth, minWidth: sidebarWidth, flexBasis: sidebarWidth, transition: resizing ? undefined : "width 200ms ease, min-width 200ms ease, flex-basis 200ms ease" }}
            >
                <div className={cn("flex h-full min-h-0 flex-col", collapsed ? "px-2" : "px-3")}>
                    <div className={cn("relative z-50 mb-5 flex items-center gap-1.5", collapsed ? "justify-center" : "px-1")}>
                        <Tooltip title={collapseLabel} placement={collapsed ? "right" : "bottom"}>
                            <button
                                type="button"
                                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-black/5 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-white"
                                onClick={() => setCollapsedAndPersist(!collapsed)}
                                aria-label={collapseLabel}
                            >
                                {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
                            </button>
                        </Tooltip>
                        {collapsed ? null : (
                            <Link to="/" className="flex min-w-0 items-center gap-2 text-sm font-semibold leading-none text-stone-950 dark:text-stone-100" aria-label={t("meta.title")}>
                                <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-[10px] font-bold leading-none text-white">CR</span>
                                <span className="truncate text-[15px] font-semibold">{t("meta.title")}</span>
                            </Link>
                        )}
                    </div>

                    <nav className={cn("flex flex-col gap-0.5", collapsed && "items-center")}>
                        {collapsed ? (
                            <Tooltip title={t("canvas.create")} placement="right">
                                <button type="button" onClick={createAndEnter} className="flex size-10 items-center justify-center rounded-lg text-stone-700 transition hover:bg-stone-200/70 dark:text-stone-200 dark:hover:bg-stone-900" aria-label={t("canvas.create")}>
                                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-blue-500 text-white">
                                        <Plus className="size-3.5" />
                                    </span>
                                </button>
                            </Tooltip>
                        ) : (
                            <button type="button" onClick={createAndEnter} className="flex h-10 items-center gap-2.5 rounded-lg px-2 text-left text-sm text-stone-700 transition hover:bg-stone-200/70 dark:text-stone-200 dark:hover:bg-stone-900" aria-label={t("canvas.create")}>
                                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-blue-500 text-white">
                                    <Plus className="size-3.5" />
                                </span>
                                <span className="truncate font-medium">{t("canvas.create")}</span>
                            </button>
                        )}
                        <SidebarItem collapsed={collapsed} to="/" label={t("navigation.home")} active={pathname === "/"}>
                            <Home className="size-4 shrink-0" />
                        </SidebarItem>
                        <SidebarItem collapsed={collapsed} to="/canvas" label={t("navigation.canvas")} active={pathname === "/canvas"}>
                            <FolderOpen className="size-4 shrink-0" />
                        </SidebarItem>
                        <Dropdown
                            trigger={["click"]}
                            placement={collapsed ? "rightTop" : "bottomLeft"}
                            onOpenChange={setConfigMenuOpen}
                            destroyOnHidden
                            menu={{
                                items: [
                                    ...(hosted
                                        ? []
                                        : [{ key: "agent", icon: <Bot className="size-4" />, label: t("navigation.agentSettings"), onClick: () => { setConfigMenuOpen(false); openAgentInProject("setup"); } }]),
                                    { key: "skills", icon: <Sparkles className="size-4" />, label: t("navigation.agentSkills"), onClick: () => { setConfigMenuOpen(false); openAgentInProject("skills"); } },
                                ],
                            }}
                        >
                            {collapsed ? (
                                <Tooltip title={configMenuOpen ? undefined : t("navigation.config")} placement="right">
                                    <button type="button" className={cn(navItemClass(collapsed), "text-left")} aria-label={t("navigation.config")} aria-expanded={configMenuOpen}>
                                        <Settings2 className="size-4 shrink-0" />
                                    </button>
                                </Tooltip>
                            ) : (
                                <button type="button" className={cn(navItemClass(collapsed), "w-full text-left")} aria-label={t("navigation.config")} aria-expanded={configMenuOpen}>
                                    <Settings2 className="size-4 shrink-0" />
                                    <span className="min-w-0 flex-1 truncate">{t("navigation.config")}</span>
                                    <ChevronDown className={cn("size-3.5 shrink-0 opacity-50 transition-transform", configMenuOpen && "rotate-180")} />
                                </button>
                            )}
                        </Dropdown>
                    </nav>

                    {collapsed ? (
                        <div className="min-h-0 flex-1" />
                    ) : (
                        <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
                            <button
                                type="button"
                                onClick={() => setProjectsExpanded((prev) => !prev)}
                                className="flex w-full items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-stone-400 transition hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
                            >
                                <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", projectsExpanded ? "" : "-rotate-90")} />
                                <span className="truncate">{t("canvas.recentProjects")}</span>
                            </button>
                            {projectsExpanded ? (
                                <div className="mt-1 flex flex-col gap-0.5">
                                    {recentProjects.length ? (
                                        recentProjects.map((project) => <RecentProjectRow key={project.id} project={project} active={project.id === currentProjectId} />)
                                    ) : (
                                        <div className="px-3 py-2 text-sm text-stone-400 dark:text-stone-600">{t("canvas.empty")}</div>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    )}

                    <div className={cn("relative z-50 border-t border-stone-200 dark:border-stone-800", collapsed ? "flex flex-col items-center gap-1 pt-2" : "flex items-center pt-3")}>
                        <UserStatusActions showConfig={false} className={collapsed ? "flex-col" : undefined} />
                    </div>
                </div>

                <button type="button" className="group absolute inset-y-0 right-0 z-40 w-3 translate-x-1/2 cursor-col-resize" onPointerDown={startResize} aria-label={t("navigation.resize")}>
                    <span className={cn("absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition", resizing ? "bg-blue-500" : "bg-transparent group-hover:bg-blue-500/70")} />
                </button>
            </aside>

            <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-stone-200 bg-background/90 px-4 backdrop-blur-xl dark:border-stone-800 md:hidden">
                <div className="flex min-w-0 items-center gap-2">
                    <button type="button" className="inline-flex size-8 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white" onClick={() => setMobileNavOpen(true)} aria-label={t("topNav.openMenu")} title={t("topNav.menu")}>
                        <Menu className="size-5" />
                    </button>
                    <Link to="/" className="flex items-center gap-2 text-sm font-semibold leading-none text-stone-950 dark:text-stone-100">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold leading-none text-white">CR</span>
                        <span className="truncate text-base font-medium">{t("meta.title")}</span>
                    </Link>
                </div>
                <UserStatusActions />
            </header>

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} onClose={() => setMobileNavOpen(false)} />
            <AppConfigModal />
        </>
    );
}
