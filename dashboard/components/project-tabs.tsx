"use client";
/** Project page tabs. The open tab lives in the address (?tab=...), so a link can open the page on any tab. */
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button, Card, CardBody, CardHeader, Explain, Tabs, TabsContent, TabsList, TabsTrigger } from "./ui";
import { AreaDaily } from "./charts";
import { IssueList, VerdictBadge } from "./blocks";
import { ProjectCampaigns } from "./project-campaigns";
import { ProjectAgency, ProjectKeywords, ProjectTerms } from "./project-lists";
import { ProjectCtm } from "./project-ctm";
import { drange, inr, lakh, pcolor } from "@/lib/format";
import type { Model } from "@/lib/types";

export const PROJECT_TABS = ["overview", "campaigns", "terms", "keywords", "agency", "ctm"] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];

export function ProjectTabs({ model, id, initial }: { model: Model; id: string; initial: ProjectTab }) {
  const router = useRouter();
  const pathname = usePathname();
  const hasKw = !!model.keywords;
  const hasCtm = !!model.ctm && model.ctm.project === id;
  const allowed = (t: string): t is ProjectTab =>
    (PROJECT_TABS as readonly string[]).includes(t) && (t !== "keywords" || hasKw) && (t !== "ctm" || hasCtm);
  const [tab, setTab] = React.useState<ProjectTab>(allowed(initial) ? initial : "overview");

  const change = (v: string) => {
    if (!allowed(v)) return;
    setTab(v);
    router.replace(v === "overview" ? pathname : `${pathname}?tab=${v}`, { scroll: false });
  };

  const name = model.projects.find((p) => p.id === id)?.name.replace(" County", "") ?? id;
  const fixes = model.fixes.filter((f) => f.project === id);
  const camps = model.campaigns.filter((c) => c.project === id);
  const ps = model.project_stats[id];
  const w = model.windows;

  return (
    <Tabs value={tab} onValueChange={change} className="mt-8">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="terms">Search terms</TabsTrigger>
          {hasKw ? <TabsTrigger value="keywords">Keywords</TabsTrigger> : null}
          <TabsTrigger value="agency">Agency</TabsTrigger>
          {hasCtm ? <TabsTrigger value="ctm">Google CTM</TabsTrigger> : null}
        </TabsList>
      </div>

      <TabsContent value="overview">
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title={`What to fix in ${name}`} description="Most urgent first. Click any line for what happened and what to do." />
            <div className="px-2 pb-2 pt-1">
              {fixes.length ? <IssueList fixes={fixes} model={model} showProject={false} /> : (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
                  <CheckCircle2 className="size-6 text-good" /> Nothing to fix in the data for {name}.
                </div>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Campaigns" description={camps.length ? `Spend per day over ${model.period?.name ?? "the last 7 days"}, and how each one is doing.` : "No campaign data yet"} />
            <CardBody className="pt-3">
              {camps.length ? (
                <div className="space-y-1">
                  {[...camps].sort((a, b) => (b.last7?.cost ?? 0) - (a.last7?.cost ?? 0)).map((c) => (
                    <button key={c.id} type="button" onClick={() => change("campaigns")}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted/60">
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium">{c.label}</span>
                        <span className="text-xs text-muted-foreground tabular">{inr(c.last7?.cost_per_day)} a day · budget {inr(c.budget_now)}</span>
                      </span>
                      <VerdictBadge c={c} />
                    </button>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">Import a campaign report to see this project&apos;s campaigns.</p>}
            </CardBody>
          </Card>
        </div>

        {camps.length && ps ? (
          <Card className="mt-4">
            <CardHeader title="Daily spend" description={`${lakh(ps.since.cost)} across ${name}'s search campaigns, ${drange(w.since?.from, w.since?.to) || "since the start of the data"}.`}
              action={<Button variant="ghost" size="sm" onClick={() => change("campaigns")}>By campaign <ArrowRight /></Button>} />
            <CardBody className="pt-3">
              <AreaDaily data={ps.daily as unknown as Record<string, unknown>[]} dataKey="cost" color={pcolor(id)} height={240} />
              <Explain>A sudden step up or down usually follows a change someone made: a budget, a bid strategy or a batch of keywords. Open the Campaigns tab and click a campaign to see which one moved, and on which day.</Explain>
            </CardBody>
          </Card>
        ) : null}
      </TabsContent>

      <TabsContent value="campaigns"><ProjectCampaigns model={model} id={id} /></TabsContent>
      <TabsContent value="terms"><ProjectTerms model={model} id={id} /></TabsContent>
      {hasKw ? <TabsContent value="keywords"><ProjectKeywords model={model} id={id} /></TabsContent> : null}
      <TabsContent value="agency"><ProjectAgency model={model} id={id} /></TabsContent>
      {hasCtm ? <TabsContent value="ctm"><ProjectCtm model={model} /></TabsContent> : null}
    </Tabs>
  );
}
