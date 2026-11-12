"use client";
/** The frame around every page: the sidebar (sections and projects), the top bar (freshness, import, theme, export). */
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Command } from "cmdk";
import {
  AlertTriangle, BookOpen, ClipboardCheck, Command as CommandIcon, Database, KeyRound, LayoutDashboard, Megaphone, Menu, Moon, Printer, Search, Sun, Swords, Upload,
} from "lucide-react";
import { Button, Tip } from "./ui";
import { cn } from "@/lib/format";

export interface ShellProject { id: string; name: string; color: string; urgent: number }
export interface ShellInfo { projects: ShellProject[]; fresh: string; issues: number; hasData: boolean }

const NAV = [
  { group: "Decide", items: [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/issues", label: "Issues to fix", icon: AlertTriangle, badge: "issues" as const },
  ] },
  { group: "Agency QC", items: [
    { href: "/agency", label: "Said vs done", icon: ClipboardCheck },
    { href: "/search-terms", label: "Search terms", icon: Search },
  ] },
  { group: "Performance", items: [
    { href: "/campaigns", label: "Campaigns", icon: Megaphone },
    { href: "/keywords", label: "Keywords", icon: KeyRound },
    { href: "/competitors", label: "Competitors", icon: Swords },
  ] },
  { group: "Data", items: [
    { href: "/data", label: "Import data", icon: Database },
    { href: "/help", label: "How to read this", icon: BookOpen },
  ] },
];

function NavLink({ href, active, children, onClick }: { href: string; active: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <Link href={href} onClick={onClick} aria-current={active ? "page" : undefined}
      className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] transition-colors [&_svg]:size-4",
        active ? "bg-card font-medium text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-card/70 hover:text-foreground")}>
      {children}
    </Link>
  );
}

function SidebarBody({ info, onNavigate }: { info: ShellInfo; onNavigate?: () => void }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  return (
    <div className="flex h-full flex-col gap-1 px-3 py-4">
      <Link href="/" onClick={onNavigate} className="mb-4 flex items-center gap-2.5 px-2">
        <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Search className="size-4" strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <div className="text-[14px] font-semibold tracking-tight">County Search QC</div>
          <div className="text-[11.5px] text-muted-foreground">Google Ads quality check</div>
        </div>
      </Link>
      {NAV.slice(0, 1).map((g) => (
        <div key={g.group} className="mb-2">
          {g.items.map((it) => (
            <NavLink key={it.href} href={it.href} active={isActive(it.href)} onClick={onNavigate}>
              <it.icon /> {it.label}
              {it.badge === "issues" && info.issues ? <span className="ml-auto rounded-full bg-bad-soft px-1.5 text-[11px] font-semibold text-bad tabular">{info.issues}</span> : null}
            </NavLink>
          ))}
        </div>
      ))}
      <div className="px-2.5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Projects</div>
      {info.projects.map((p) => (
        <NavLink key={p.id} href={`/projects/${p.id}`} active={isActive(`/projects/${p.id}`)} onClick={onNavigate}>
          <span className="size-2.5 rounded-full" style={{ background: p.color }} />
          {p.name}
          {p.urgent ? <span className="ml-auto text-[11px] font-semibold text-bad tabular">{p.urgent}</span> : null}
        </NavLink>
      ))}
      {NAV.slice(1).map((g) => (
        <div key={g.group}>
          <div className="px-2.5 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{g.group}</div>
          {g.items.map((it) => (
            <NavLink key={it.href} href={it.href} active={isActive(it.href)} onClick={onNavigate}><it.icon /> {it.label}</NavLink>
          ))}
        </div>
      ))}
      <div className="mt-auto rounded-lg border bg-card px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
        <div className="font-medium text-foreground">Data</div>
        {info.fresh}
        <div className="mt-1">Runs only on this computer.</div>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Tip content={dark ? "Light mode" : "Dark mode"}>
      <Button variant="ghost" size="icon" onClick={() => setTheme(dark ? "light" : "dark")} aria-label="Switch light or dark mode">
        {dark ? <Sun /> : <Moon />}
      </Button>
    </Tip>
  );
}

function CommandMenu({ info }: { info: ShellInfo }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const go = (href: string) => { setOpen(false); router.push(href); };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="hidden h-9 w-72 items-center gap-2 whitespace-nowrap rounded-lg border bg-card px-3 text-sm text-muted-foreground hover:bg-muted md:flex">
        <Search className="size-4 shrink-0" /> <span className="truncate">Go to a page or project</span>
        <kbd className="ml-auto shrink-0 rounded border bg-muted px-1.5 text-[10px] font-medium">Ctrl K</kbd>
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-start bg-black/30 px-4 pt-[12vh]" onClick={() => setOpen(false)}>
          <Command label="Jump to" className="mx-auto w-full max-w-lg overflow-hidden rounded-xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b px-3"><CommandIcon className="size-4 text-muted-foreground" />
              <Command.Input autoFocus placeholder="Type a page or project…" className="h-11 w-full bg-transparent text-sm outline-none" />
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches.</Command.Empty>
              {NAV.flatMap((g) => g.items).map((it) => (
                <Command.Item key={it.href} onSelect={() => go(it.href)} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-muted">
                  <it.icon className="size-4 text-muted-foreground" /> {it.label}
                </Command.Item>
              ))}
              {info.projects.map((p) => (
                <Command.Item key={p.id} onSelect={() => go(`/projects/${p.id}`)} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-muted">
                  <span className="size-2.5 rounded-full" style={{ background: p.color }} /> {p.name}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </div>
      ) : null}
    </>
  );
}

export function Shell({ info, children }: { info: ShellInfo; children: React.ReactNode }) {
  const [mobile, setMobile] = React.useState(false);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen overflow-y-auto border-r bg-sidebar lg:block">
        <SidebarBody info={info} />
      </aside>
      {mobile ? (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobile(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <aside className="absolute inset-y-0 left-0 w-72 overflow-y-auto border-r bg-sidebar" onClick={(e) => e.stopPropagation()}>
            <SidebarBody info={info} onNavigate={() => setMobile(false)} />
          </aside>
        </div>
      ) : null}
      <div className="min-w-0">
        <header className="app-topbar sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobile(true)} aria-label="Open menu"><Menu /></Button>
          <CommandMenu info={info} />
          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground xl:inline">{info.fresh}</span>
            <Button variant="outline" size="sm" asChild><Link href="/data"><Upload /> Import</Link></Button>
            <Tip content="Print or save as PDF">
              <Button variant="ghost" size="icon" onClick={() => window.print()} aria-label="Print or save as PDF"><Printer /></Button>
            </Tip>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
