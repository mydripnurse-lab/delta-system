"use client";

import { useEffect, useMemo, useState } from "react";
import AiAgentChatPanel from "@/components/AiAgentChatPanel";
import DashboardTopbar from "@/components/DashboardTopbar";
import { useBrowserSearchParams } from "@/lib/useBrowserSearchParams";
import { useResolvedTenantId } from "@/lib/useResolvedTenantId";
import { computeDashboardRange, type DashboardRangePreset } from "@/lib/dateRangePresets";

type RangePreset = DashboardRangePreset;

type OverviewResponse = {
  ok: boolean;
  error?: string;
  range?: { start: string; end: string; preset: string; adsRange: string };
  executive?: {
    leadsNow: number;
    appointmentsNow: number;
    appointmentsLostNow: number;
    appointmentsLostValueNow: number;
    transactionsRevenueNow: number;
  };
  topOpportunitiesGeo?: {
    states: Array<{ name: string; opportunities: number; value: number; uniqueContacts: number }>;
    counties: Array<{ name: string; opportunities: number; value: number; uniqueContacts: number }>;
    cities: Array<{ name: string; opportunities: number; value: number; uniqueContacts: number }>;
  };
  attribution?: {
    topSources: Array<{
      source: string;
      leads: number;
      appointments: number;
      revenue: number;
      leadToAppointmentRate: number;
    }>;
  };
  actionCenter?: {
    playbooks: Array<{
      id: string;
      priority: "P1" | "P2" | "P3";
      title: string;
      why: string;
    }>;
  };
};

type YoutubePlaybook = {
  region: string;
  objective: "Leads" | "Bookings" | "Retargeting";
  dailyBudget: number;
  audience: string;
  hook: string;
  script15s: string;
  script30s: string;
  cta: string;
  runwayPrompt: string;
};

type YoutubeAiPlaybookItem = {
  region: string;
  objective: string;
  budget_daily_usd: number;
  audience: string;
  video_hook: string;
  script_15s: string;
  script_30s: string;
  cta: string;
  runway_prompt: string;
  expected_impact: "low" | "medium" | "high";
};

type YoutubeAiInsights = {
  executive_summary?: string;
  scorecard?: { primary_risk?: string; primary_opportunity?: string };
  playbook?: YoutubeAiPlaybookItem[];
};

type RunwayVideoResponse = {
  ok: boolean;
  error?: string;
  id?: string;
  status?: string;
  model?: string;
  outputUrl?: string;
  outputPreviewUrl?: string;
};

type CampaignFactoryContext = {
  landingMap?: {
    services?: Array<{
      id?: string;
      name?: string;
      description?: string;
      landingPath?: string;
      formPath?: string;
      bookingPath?: string;
      cta?: string;
      ctaSecondary?: string;
    }>;
  };
  defaultBaseUrl?: string;
};

type PromptBuilderState = {
  objective: "Leads" | "Bookings" | "Retargeting";
  offer: string;
  tone: "premium" | "clinical" | "energetic";
  pacing: "slow" | "balanced" | "fast";
  visualStyle: "cinematic" | "ugc" | "documentary";
  camera: "static" | "dynamic" | "mixed";
  ctaStrength: "soft" | "medium" | "hard";
  compliance: "strict" | "balanced";
  useTextOverlay: boolean;
  showNurse: boolean;
  showHomeScene: boolean;
};

type CampaignDraft = {
  campaignName: string;
  adGroupName: string;
  objective: string;
  dailyBudgetUsd: string;
  biddingStrategy: string;
  targetCpaUsd: string;
  targetRoas: string;
  startDate: string;
  endDate: string;
  region: string;
  languages: string;
  inventoryType: string;
  devices: string;
  audiences: string;
  keywords: string;
  placements: string;
  finalUrl: string;
  displayUrl: string;
  cta: string;
  headline: string;
  longHeadline: string;
  description1: string;
  description2: string;
  trackingTemplate: string;
  utmCampaign: string;
  utmContent: string;
};

function fmtInt(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString();
}

function fmtMoney(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "$0";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function s(v: unknown) {
  return String(v ?? "").trim();
}

function geoName(v: string | undefined | null) {
  const raw = s(v);
  if (!raw || raw === "__unknown") return "Unknown";
  return raw;
}

function csvCell(v: unknown) {
  const x = String(v ?? "");
  return `"${x.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<unknown>>) {
  const lines = [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function oneLine(v: string) {
  return s(v).replace(/\s+/g, " ");
}

function toAbsUrl(base: string, rawPath: string) {
  const p = s(rawPath);
  if (!p) return "";
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  const b = s(base).replace(/\/+$/g, "");
  if (!b) return p.startsWith("/") ? p : `/${p}`;
  return `${b}/${p.replace(/^\/+/, "")}`;
}

export default function YoutubeAdsDashboardPage() {
  const searchParams = useBrowserSearchParams();
  const { tenantId, tenantReady } = useResolvedTenantId(searchParams);
  const integrationKey = String(searchParams?.get("integrationKey") || "owner").trim() || "owner";
  const backHref = tenantId
    ? `/dashboard?tenantId=${encodeURIComponent(tenantId)}&integrationKey=${encodeURIComponent(integrationKey)}`
    : "/dashboard";
  const notificationsHref = tenantId
    ? `/dashboard/notification-hub?tenantId=${encodeURIComponent(tenantId)}&integrationKey=${encodeURIComponent(integrationKey)}`
    : "/dashboard/notification-hub";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const [aiPlaybook, setAiPlaybook] = useState<YoutubeAiInsights | null>(null);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [preset, setPreset] = useState<RangePreset>("28d");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const [runwayPrompt, setRunwayPrompt] = useState("");
  const [runwayModel, setRunwayModel] = useState("gen4.5");
  const [runwayRatio, setRunwayRatio] = useState("1280:720");
  const [runwayDuration, setRunwayDuration] = useState("10");
  const [seedImageUrl, setSeedImageUrl] = useState("");
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoErr, setVideoErr] = useState("");
  const [videoGen, setVideoGen] = useState<RunwayVideoResponse | null>(null);
  const [campaignCtx, setCampaignCtx] = useState<CampaignFactoryContext | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState("");

  const [builder, setBuilder] = useState<PromptBuilderState>({
    objective: "Leads",
    offer: "Book same-day mobile IV visit",
    tone: "premium",
    pacing: "balanced",
    visualStyle: "cinematic",
    camera: "mixed",
    ctaStrength: "medium",
    compliance: "strict",
    useTextOverlay: true,
    showNurse: true,
    showHomeScene: true,
  });

  const [campaign, setCampaign] = useState<CampaignDraft>({
    campaignName: "MDN YouTube FL Q1",
    adGroupName: "Florida Intent - Wellness",
    objective: "Leads",
    dailyBudgetUsd: "120",
    biddingStrategy: "Maximize Conversions",
    targetCpaUsd: "45",
    targetRoas: "2.5",
    startDate: "",
    endDate: "",
    region: "Florida",
    languages: "English, Spanish",
    inventoryType: "Standard Inventory",
    devices: "All devices",
    audiences: "In-market Wellness, Custom intent mobile IV, Website visitors 30d",
    keywords: "mobile iv therapy florida, hydration iv near me, nurse iv service",
    placements: "youtube.com, health & wellness channels",
    finalUrl: "https://mydripnurse.com/book",
    displayUrl: "mydripnurse.com/book",
    cta: "Book your IV visit",
    headline: "Feeling low energy in Florida?",
    longHeadline: "Mobile IV therapy with licensed nurses in Florida",
    description1: "Same-day appointments. Transparent pricing.",
    description2: "Book your personalized IV plan in minutes.",
    trackingTemplate: "{lpurl}?utm_source=youtube&utm_medium=cpc&utm_campaign={_campaign}&utm_content={_creative}",
    utmCampaign: "youtube_florida_iv_q1",
    utmContent: "video_a",
  });

  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalErr, setProposalErr] = useState("");
  const [proposalMsg, setProposalMsg] = useState("");
  const [youtubeAgentId, setYoutubeAgentId] = useState("soul_youtube_ads");

  async function load(force?: boolean) {
    if (!tenantReady) return;
    if (!tenantId) {
      setError("Missing tenant context. Open from Control Tower or use a mapped project domain.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const range = computeDashboardRange(preset, start, end);
      if (!range.start || !range.end) {
        throw new Error("Missing start/end range values.");
      }
      const qs = new URLSearchParams();
      qs.set("preset", preset);
      qs.set("start", range.start);
      qs.set("end", range.end);
      qs.set("tenantId", tenantId);
      qs.set("integrationKey", integrationKey);
      qs.set("compare", "1");
      if (force) qs.set("force", "1");
      const res = await fetch(`/api/dashboard/overview?${qs.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as OverviewResponse;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json);
      await loadCampaignContext(range.start, range.end, force === true);
    } catch (e: unknown) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load YouTube Ads dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function loadCampaignContext(rangeStart: string, rangeEnd: string, force: boolean) {
    if (!tenantId) return;
    try {
      const qs = new URLSearchParams();
      if (rangeStart) qs.set("start", rangeStart);
      if (rangeEnd) qs.set("end", rangeEnd);
      qs.set("tenantId", tenantId);
      qs.set("integrationKey", integrationKey);
      qs.set("keywordLimit", "30");
      if (force) qs.set("force", "1");
      const res = await fetch(`/api/dashboard/campaign-factory/context?${qs.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; context?: CampaignFactoryContext } | null;
      if (!res.ok || !json?.ok || !json.context) return;
      setCampaignCtx(json.context);
    } catch {
      // Non-blocking for dashboard.
    }
  }

  useEffect(() => {
    if (!tenantReady) return;
    if (preset !== "custom") load(false);
    else if (start && end) load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, start, end, tenantReady, tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    async function loadAgentRouting() {
      try {
        const res = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/integrations/openclaw`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; agents?: Record<string, { agentId?: string }> } | null;
        if (!res.ok || !json?.ok) return;
        const agentId = s(json?.agents?.youtube_ads?.agentId);
        if (agentId) setYoutubeAgentId(agentId);
      } catch {
        // fallback to default soul id
      }
    }
    void loadAgentRouting();
  }, [tenantId]);

  const serviceCatalog = useMemo(() => {
    const base = s(campaignCtx?.defaultBaseUrl) || "https://mydripnurse.com";
    const services = Array.isArray(campaignCtx?.landingMap?.services) ? campaignCtx?.landingMap?.services : [];
    return services
      .map((service) => {
        const id = s(service?.id);
        const name = s(service?.name);
        const landingUrl = toAbsUrl(base, s(service?.landingPath));
        if (!id || !name || !landingUrl) return null;
        return {
          id,
          name,
          description: s(service?.description),
          cta: s(service?.cta) || "Book your IV visit",
          ctaSecondary: s(service?.ctaSecondary),
          landingUrl,
          formUrl: toAbsUrl(base, s(service?.formPath)),
          bookingUrl: toAbsUrl(base, s(service?.bookingPath)),
        };
      })
      .filter(
        (
          row,
        ): row is {
          id: string;
          name: string;
          description: string;
          cta: string;
          ctaSecondary: string;
          landingUrl: string;
          formUrl: string;
          bookingUrl: string;
        } => Boolean(row),
      );
  }, [campaignCtx?.defaultBaseUrl, campaignCtx?.landingMap?.services]);

  const selectedService = useMemo(
    () => serviceCatalog.find((x) => x.id === selectedServiceId) || null,
    [serviceCatalog, selectedServiceId],
  );

  const playbooks = useMemo<YoutubePlaybook[]>(() => {
    const states = (data?.topOpportunitiesGeo?.states || []).slice(0, 6);
    const serviceName = selectedService?.name || "mobile IV therapy";
    const serviceCta = selectedService?.cta || "Book your IV visit";
    return states.map((st, idx) => {
      const opps = Number(st.opportunities || 0);
      const val = Number(st.value || 0);
      const objective: YoutubePlaybook["objective"] = opps >= 8 ? "Bookings" : idx < 2 ? "Leads" : "Retargeting";
      const baseBudget = Math.max(25, Math.round((val / Math.max(1, opps)) * 0.18));
      const region = geoName(st.name);
      const hook =
        objective === "Bookings"
          ? `Need ${serviceName} in ${region} today?`
          : objective === "Leads"
            ? `Feeling low energy in ${region}?`
            : `Still thinking about booking your ${serviceName}?`;
      const script15s = `${hook} My Drip Nurse sends licensed nurses to your location. Same-day support, transparent pricing. ${serviceCta}.`;
      const script30s = `${hook} My Drip Nurse serves ${region} with ${serviceName}. Licensed nurses, easy scheduling, and fast response. Click to get your personalized IV plan and book in minutes.`;
      const cta = objective === "Retargeting" ? "Finish booking today" : serviceCta;
      const runwayPrompt =
        `Cinematic YouTube ad, ${region}, healthcare wellness tone, mobile IV nurse arrival, clean daylight, realistic people, subtle motion graphics, headline "${hook}", CTA "${cta}", 16:9, premium commercial style.`;
      return {
        region,
        objective,
        dailyBudget: baseBudget,
        audience: `Adults in ${region} with wellness, hydration, recovery, and premium healthcare intent`,
        hook,
        script15s,
        script30s,
        cta,
        runwayPrompt,
      };
    });
  }, [data, selectedService?.cta, selectedService?.name]);

  function updateBuilder<K extends keyof PromptBuilderState>(key: K, value: PromptBuilderState[K]) {
    setBuilder((prev) => ({ ...prev, [key]: value }));
  }

  function updateCampaign<K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) {
    setCampaign((prev) => ({ ...prev, [key]: value }));
  }

  const builderPrompt = useMemo(() => {
    const region = campaign.region || playbooks[0]?.region || "Florida";
    const serviceName = selectedService?.name || "mobile IV therapy";
    const scriptBase = oneLine(campaign.description1 || playbooks[0]?.script30s || "Mobile IV therapy with licensed nurses.");
    const pace = builder.pacing === "fast" ? "quick cuts" : builder.pacing === "slow" ? "longer calm shots" : "balanced cuts";
    const camera = builder.camera === "dynamic" ? "handheld + dolly movement" : builder.camera === "static" ? "stable tripod shots" : "mix static and dynamic camera";
    const style = builder.visualStyle === "ugc" ? "authentic UGC look" : builder.visualStyle === "documentary" ? "documentary realism" : "premium cinematic commercial";
    const tone = builder.tone === "clinical" ? "clinical trust-building tone" : builder.tone === "energetic" ? "energetic motivational tone" : "premium wellness tone";
    const compliance =
      builder.compliance === "strict"
        ? "No exaggerated medical claims. Compliance-safe language."
        : "Avoid explicit claims; keep outcomes realistic.";
    const overlays = builder.useTextOverlay ? "Minimal text overlays with headline and CTA." : "No text overlays except end card.";
    const nurse = builder.showNurse ? "Show licensed nurse arrival and setup." : "Focus on lifestyle and result shots.";
    const home = builder.showHomeScene ? "Start with at-home fatigue scene." : "Skip home fatigue scene.";
    const cta =
      builder.ctaStrength === "hard"
        ? "Strong CTA end card: Book your IV visit now."
        : builder.ctaStrength === "soft"
          ? "Soft CTA end card: Learn more and schedule when ready."
          : "CTA end card: Book your IV visit.";

    return oneLine(
      `YouTube ad for ${region}. Objective: ${builder.objective}. Offer: ${builder.offer}. Featured service: ${serviceName}. ${tone}. ${style}. ${pace}. ${camera}. ${home} ${nurse} Narrative base: ${scriptBase}. ${overlays} ${cta} Aspect ratio ${runwayRatio}. ${compliance}`,
    );
  }, [builder, campaign.description1, campaign.region, playbooks, runwayRatio, selectedService?.name]);

  useEffect(() => {
    if (!runwayPrompt && playbooks[0]?.runwayPrompt) {
      setRunwayPrompt(playbooks[0].runwayPrompt);
    }
  }, [playbooks, runwayPrompt]);

  useEffect(() => {
    if (!campaign.region && playbooks[0]?.region) {
      updateCampaign("region", playbooks[0].region);
    }
  }, [campaign.region, playbooks]);

  useEffect(() => {
    if (!serviceCatalog.length) return;
    const exists = serviceCatalog.some((x) => x.id === selectedServiceId);
    if (!exists) {
      const first = serviceCatalog[0];
      setSelectedServiceId(first.id);
      setCampaign((prev) => {
        const nextFinal = s(prev.finalUrl);
        const nextDisplay = s(prev.displayUrl);
        const nextCta = s(prev.cta);
        return {
          ...prev,
          finalUrl: nextFinal || first.bookingUrl || first.formUrl || first.landingUrl,
          displayUrl: nextDisplay || first.landingUrl.replace(/^https?:\/\//i, ""),
          cta: nextCta || first.cta,
        };
      });
    }
  }, [serviceCatalog, selectedServiceId]);

  useEffect(() => {
    const u = s(videoGen?.outputUrl);
    if (!u) return;
    if (!campaign.headline) updateCampaign("headline", `Feeling low energy in ${campaign.region || "your area"}?`);
  }, [videoGen?.outputUrl, campaign.headline, campaign.region]);

  const stats = {
    leads: Number(data?.executive?.leadsNow || 0),
    appts: Number(data?.executive?.appointmentsNow || 0),
    lost: Number(data?.executive?.appointmentsLostNow || 0),
    lostValue: Number(data?.executive?.appointmentsLostValueNow || 0),
    revenue: Number(data?.executive?.transactionsRevenueNow || 0),
  };

  function exportPlaybooksCsv() {
    const headers = [
      "region",
      "objective",
      "daily_budget_usd",
      "audience",
      "hook",
      "script_15s",
      "script_30s",
      "cta",
      "runway_prompt",
    ];
    const rows = playbooks.map((pb) => [
      pb.region,
      pb.objective,
      pb.dailyBudget,
      pb.audience,
      pb.hook,
      pb.script15s,
      pb.script30s,
      pb.cta,
      pb.runwayPrompt,
    ]);
    const dt = new Date().toISOString().slice(0, 10);
    downloadCsv(`youtube-ads-playbooks-${dt}.csv`, headers, rows);
  }

  async function generateAiPlaybook() {
    setAiLoading(true);
    setAiErr("");
    try {
      const payload = {
        range: data?.range,
        executive: data?.executive,
        topOpportunitiesGeo: data?.topOpportunitiesGeo,
        attribution: data?.attribution,
        actionCenter: data?.actionCenter,
        draftPlaybooks: playbooks,
      };
      const res = await fetch("/api/dashboard/youtube-ads/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to generate AI playbook");
      const insights = (json.insights || null) as YoutubeAiInsights | null;
      setAiPlaybook(insights);
      const topPrompt = s(insights?.playbook?.[0]?.runway_prompt);
      if (topPrompt) setRunwayPrompt(topPrompt);
    } catch (e: unknown) {
      setAiErr(e instanceof Error ? e.message : "Failed to generate AI playbook");
    } finally {
      setAiLoading(false);
    }
  }

  async function refreshVideoStatus() {
    const id = s(videoGen?.id);
    if (!id) return;
    setVideoErr("");
    try {
      const res = await fetch(`/api/dashboard/youtube-ads/video?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = (await res.json()) as RunwayVideoResponse;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to get video status");
      setVideoGen(json);
    } catch (e: unknown) {
      setVideoErr(e instanceof Error ? e.message : "Failed to refresh video status");
    }
  }

  async function createRunwayVideo() {
    setVideoBusy(true);
    setVideoErr("");
    try {
      const res = await fetch("/api/dashboard/youtube-ads/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: runwayModel,
          ratio: runwayRatio,
          durationSeconds: Number(runwayDuration || 10),
          prompt: runwayPrompt,
          seedImageUrl,
        }),
      });
      const json = (await res.json()) as RunwayVideoResponse;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Runway generation failed");
      setVideoGen(json);
    } catch (e: unknown) {
      setVideoErr(e instanceof Error ? e.message : "Runway generation failed");
    } finally {
      setVideoBusy(false);
    }
  }

  async function queueCampaignForApproval() {
    if (!tenantId) {
      setProposalErr("Missing tenant context.");
      return;
    }
    setProposalBusy(true);
    setProposalErr("");
    setProposalMsg("");
    try {
      const payload = {
        tenant_id: tenantId,
        integration_key: integrationKey,
        dashboard: "youtube_ads",
        source: "youtube_campaign_composer",
        runway: {
          model: runwayModel,
          ratio: runwayRatio,
          durationSeconds: Number(runwayDuration || 10),
          prompt: runwayPrompt,
          seedImageUrl,
          generationId: s(videoGen?.id),
          outputUrl: s(videoGen?.outputUrl),
        },
        campaign,
        selectedService: selectedService
          ? {
              id: selectedService.id,
              name: selectedService.name,
              cta: selectedService.cta,
              landingUrl: selectedService.landingUrl,
              formUrl: selectedService.formUrl,
              bookingUrl: selectedService.bookingUrl,
            }
          : null,
      };
      const res = await fetch("/api/agents/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId: tenantId,
          actionType: "publish_ads",
          agentId: youtubeAgentId || "soul_youtube_ads",
          dashboardId: "youtube_ads",
          priority: "P2",
          riskLevel: "medium",
          expectedImpact: "high",
          summary: `Publish YouTube campaign draft (${campaign.campaignName || "untitled"})`,
          payload,
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) throw new Error(s(json?.error) || `HTTP ${res.status}`);
      setProposalMsg("Campaign draft sent to Notification Hub for approval/execution.");
    } catch (e: unknown) {
      setProposalErr(e instanceof Error ? e.message : "Failed to queue campaign draft.");
    } finally {
      setProposalBusy(false);
    }
  }

  function applyPromptBuilder() {
    setRunwayPrompt(builderPrompt);
  }

  function applyPlaybookToComposer(pb: YoutubePlaybook) {
    updateCampaign("region", pb.region);
    updateCampaign("objective", pb.objective);
    updateCampaign("dailyBudgetUsd", String(pb.dailyBudget));
    updateCampaign("cta", pb.cta);
    updateCampaign("headline", pb.hook);
    updateCampaign("description1", pb.script15s);
    updateCampaign("description2", pb.script30s);
    setRunwayPrompt(pb.runwayPrompt);
  }

  function applyServiceToComposer() {
    if (!selectedService) return;
    updateCampaign("finalUrl", selectedService.bookingUrl || selectedService.formUrl || selectedService.landingUrl);
    updateCampaign("displayUrl", selectedService.landingUrl.replace(/^https?:\/\//i, ""));
    updateCampaign("cta", selectedService.cta || "Book your IV visit");
    if (!campaign.longHeadline) {
      updateCampaign("longHeadline", `${selectedService.name} with licensed nurses`);
    }
  }

  function downloadVideo() {
    const url = s(videoGen?.outputUrl);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(campaign.campaignName || "youtube-ad").replace(/\s+/g, "-").toLowerCase()}.mp4`;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  useEffect(() => {
    const status = s(videoGen?.status).toLowerCase();
    const id = s(videoGen?.id);
    if (!id) return;
    if (status.includes("succeed") || status.includes("complete") || status.includes("fail") || status.includes("error")) {
      return;
    }
    const t = window.setTimeout(() => {
      void refreshVideoStatus();
    }, 7000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoGen?.id, videoGen?.status]);

  const campaignPayloadPreview = useMemo(() => {
    return {
      platform: "youtube_ads",
      objective: campaign.objective,
      campaign_name: campaign.campaignName,
      ad_group_name: campaign.adGroupName,
      budget: {
        daily_usd: Number(campaign.dailyBudgetUsd || 0),
        bidding_strategy: campaign.biddingStrategy,
        target_cpa_usd: Number(campaign.targetCpaUsd || 0),
        target_roas: Number(campaign.targetRoas || 0),
      },
      schedule: {
        start_date: campaign.startDate || null,
        end_date: campaign.endDate || null,
      },
      targeting: {
        geo: campaign.region,
        languages: campaign.languages,
        inventory_type: campaign.inventoryType,
        devices: campaign.devices,
        audiences: campaign.audiences,
        keywords: campaign.keywords,
        placements: campaign.placements,
      },
      creative: {
        video_url: s(videoGen?.outputUrl),
        final_url: campaign.finalUrl,
        display_url: campaign.displayUrl,
        cta: campaign.cta,
        headline: campaign.headline,
        long_headline: campaign.longHeadline,
        description_1: campaign.description1,
        description_2: campaign.description2,
      },
      tracking: {
        template: campaign.trackingTemplate,
        utm_campaign: campaign.utmCampaign,
        utm_content: campaign.utmContent,
      },
    };
  }, [campaign, videoGen?.outputUrl]);

  return (
    <div className="shell callsDash gaDash">
      <DashboardTopbar
        title="My Drip Nurse — YouTube Ads + Runway Studio"
        subtitle="Delta System + OpenClaw + Runway: build, preview and queue YouTube campaigns for approval and future publishing."
        backHref={backHref}
        tenantId={tenantId}
        notificationsHref={notificationsHref}
        liveLabel="Planning + Render Mode"
      />

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Executive Filters</h2>
            <div className="cardSubtitle">Afecta KPI y recomendaciones de campañas.</div>
          </div>
          <div className="cardHeaderActions">
            <button className="smallBtn" type="button" onClick={() => load(true)} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
        <div className="cardBody">
          <div className="filtersBar">
            <div className="rangePills">
              {(["today", "24h", "7d", "28d", "1m", "3m", "6m", "1y"] as RangePreset[]).map((p) => (
                <button key={p} className={`smallBtn ${preset === p ? "smallBtnOn" : ""}`} type="button" onClick={() => setPreset(p)}>
                  {p === "today"
                    ? "Today"
                    : p === "24h"
                      ? "24hr"
                      : p === "7d"
                        ? "7 days"
                        : p === "28d"
                          ? "28 days"
                          : p === "1m"
                            ? "Last month"
                            : p === "3m"
                              ? "Last quarter"
                              : p === "6m"
                                ? "Last 6 months"
                                : "Last year"}
                </button>
              ))}
              <button className={`smallBtn ${preset === "custom" ? "smallBtnOn" : ""}`} type="button" onClick={() => setPreset("custom")}>Custom</button>
            </div>
            <div className="dateInputs">
              <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={preset !== "custom"} />
              <input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} disabled={preset !== "custom"} />
              {preset === "custom" ? (
                <button className="btn btnPrimary" type="button" onClick={() => load(true)} disabled={!start || !end || loading}>Apply</button>
              ) : null}
            </div>
          </div>
          {error ? <div className="mini" style={{ color: "var(--danger)", marginTop: 8 }}>X {error}</div> : null}
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">YouTube Ads KPI Snapshot</h2>
            <div className="cardSubtitle">Diagnóstico para distribución de presupuesto por geo y potencial de video.</div>
          </div>
          <div className="badge">Range {data?.range?.start ? new Date(data.range.start).toLocaleDateString() : "-"} → {data?.range?.end ? new Date(data.range.end).toLocaleDateString() : "-"}</div>
        </div>
        <div className="cardBody">
          <div className="kpiRow kpiRowWide">
            <div className="kpi"><p className="n">{fmtInt(stats.leads)}</p><p className="l">Leads</p></div>
            <div className="kpi"><p className="n">{fmtInt(stats.appts)}</p><p className="l">Appointments</p></div>
            <div className="kpi"><p className="n">{fmtInt(stats.lost)}</p><p className="l">Lost bookings</p></div>
            <div className="kpi"><p className="n">{fmtMoney(stats.lostValue)}</p><p className="l">Lost value</p></div>
            <div className="kpi"><p className="n">{fmtMoney(stats.revenue)}</p><p className="l">Revenue</p></div>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Products & Services Context</h2>
            <div className="cardSubtitle">Catalog from tenant Project Details used for CTA and destination URLs.</div>
          </div>
          <div className="cardHeaderActions">
            <button className="smallBtn" type="button" onClick={applyServiceToComposer} disabled={!selectedService}>
              Apply to Campaign Composer
            </button>
          </div>
        </div>
        <div className="cardBody">
          {!serviceCatalog.length ? (
            <div className="mini">No tenant services found. Add them in Project Details → Products & Services.</div>
          ) : (
            <>
              <div className="row">
                <div className="field">
                  <label>Service</label>
                  <select
                    className="input"
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                  >
                    {serviceCatalog.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>CTA</label>
                  <input className="input" value={selectedService?.cta || ""} readOnly />
                </div>
                <div className="field">
                  <label>Landing URL</label>
                  <input className="input" value={selectedService?.landingUrl || ""} readOnly />
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }} id="ai-playbook">
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">AI Playbook (YouTube Ads Expert)</h2>
            <div className="cardSubtitle">Guiones de 15s/30s + prompts para Runway basados en Delta System.</div>
          </div>
          <div className="cardHeaderActions">
            <button className="smallBtn aiBtn" type="button" onClick={generateAiPlaybook} disabled={aiLoading || loading || !playbooks.length}>
              {aiLoading ? "Generating..." : "Generate AI Playbook"}
            </button>
          </div>
        </div>
        <div className="cardBody">
          {aiErr ? <div className="mini" style={{ color: "var(--danger)" }}>X {aiErr}</div> : null}
          {aiPlaybook ? (
            <div className="moduleGrid">
              <div className="moduleCard">
                <p className="l moduleTitle">Executive summary</p>
                <p className="mini moduleLine">{String(aiPlaybook.executive_summary || "")}</p>
                <p className="mini moduleLine"><b>Primary risk:</b> {String(aiPlaybook?.scorecard?.primary_risk || "-")}</p>
                <p className="mini moduleLine"><b>Primary opportunity:</b> {String(aiPlaybook?.scorecard?.primary_opportunity || "-")}</p>
              </div>
              {Array.isArray(aiPlaybook.playbook) &&
                aiPlaybook.playbook.slice(0, 6).map((p: YoutubeAiPlaybookItem, idx: number) => (
                  <div className="moduleCard" key={`yt-ai-pb-${idx}`}>
                    <div className="moduleTop">
                      <p className="l moduleTitle">{String(p.region || "Region")}</p>
                      <span className={`mini aiImpact ${String(p.expected_impact || "medium")}`}>
                        {String(p.expected_impact || "medium").toUpperCase()}
                      </span>
                    </div>
                    <p className="mini moduleLine"><b>Objective:</b> {String(p.objective || "-")}</p>
                    <p className="mini moduleLine"><b>Budget/day:</b> {fmtMoney(p.budget_daily_usd)}</p>
                    <p className="mini moduleLine"><b>Audience:</b> {String(p.audience || "-")}</p>
                    <p className="mini moduleLine"><b>Hook:</b> {String(p.video_hook || "-")}</p>
                    <p className="mini moduleLine"><b>Script 15s:</b> {String(p.script_15s || "-")}</p>
                    <p className="mini moduleLine"><b>Script 30s:</b> {String(p.script_30s || "-")}</p>
                    <p className="mini moduleLine"><b>CTA:</b> {String(p.cta || "-")}</p>
                    <p className="mini moduleLine"><b>Runway prompt:</b> {String(p.runway_prompt || "-")}</p>
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="smallBtn" type="button" onClick={() => setRunwayPrompt(String(p.runway_prompt || ""))}>
                        Use Prompt
                      </button>
                      <button
                        className="smallBtn"
                        type="button"
                        onClick={() => applyPlaybookToComposer({
                          region: String(p.region || "Region"),
                          objective: String(p.objective || "Leads") as YoutubePlaybook["objective"],
                          dailyBudget: Number(p.budget_daily_usd || 0),
                          audience: String(p.audience || ""),
                          hook: String(p.video_hook || ""),
                          script15s: String(p.script_15s || ""),
                          script30s: String(p.script_30s || ""),
                          cta: String(p.cta || "Book now"),
                          runwayPrompt: String(p.runway_prompt || ""),
                        })}
                      >
                        Apply to Campaign
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="aiPlaceholder mini">
              Generate AI Playbook para crear guiones de YouTube Ads y prompts listos para Runway.
            </div>
          )}
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Prompt Builder Pro</h2>
            <div className="cardSubtitle">Builder técnico para producir prompts consistentes y listos para performance YouTube.</div>
          </div>
          <div className="cardHeaderActions">
            <button className="smallBtn" type="button" onClick={applyPromptBuilder}>Apply Builder Prompt</button>
          </div>
        </div>
        <div className="cardBody">
          <div className="moduleGrid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
            <div className="moduleCard">
              <p className="l moduleTitle">Objective</p>
              <select className="input" value={builder.objective} onChange={(e) => updateBuilder("objective", e.target.value as PromptBuilderState["objective"])}>
                <option>Leads</option>
                <option>Bookings</option>
                <option>Retargeting</option>
              </select>
            </div>
            <div className="moduleCard">
              <p className="l moduleTitle">Tone</p>
              <select className="input" value={builder.tone} onChange={(e) => updateBuilder("tone", e.target.value as PromptBuilderState["tone"])}>
                <option value="premium">Premium</option>
                <option value="clinical">Clinical</option>
                <option value="energetic">Energetic</option>
              </select>
            </div>
            <div className="moduleCard">
              <p className="l moduleTitle">Pacing</p>
              <select className="input" value={builder.pacing} onChange={(e) => updateBuilder("pacing", e.target.value as PromptBuilderState["pacing"])}>
                <option value="slow">Slow</option>
                <option value="balanced">Balanced</option>
                <option value="fast">Fast</option>
              </select>
            </div>
            <div className="moduleCard">
              <p className="l moduleTitle">Visual Style</p>
              <select className="input" value={builder.visualStyle} onChange={(e) => updateBuilder("visualStyle", e.target.value as PromptBuilderState["visualStyle"])}>
                <option value="cinematic">Cinematic</option>
                <option value="ugc">UGC</option>
                <option value="documentary">Documentary</option>
              </select>
            </div>
            <div className="moduleCard">
              <p className="l moduleTitle">Camera</p>
              <select className="input" value={builder.camera} onChange={(e) => updateBuilder("camera", e.target.value as PromptBuilderState["camera"])}>
                <option value="mixed">Mixed</option>
                <option value="dynamic">Dynamic</option>
                <option value="static">Static</option>
              </select>
            </div>
            <div className="moduleCard">
              <p className="l moduleTitle">Compliance</p>
              <select className="input" value={builder.compliance} onChange={(e) => updateBuilder("compliance", e.target.value as PromptBuilderState["compliance"])}>
                <option value="strict">Strict</option>
                <option value="balanced">Balanced</option>
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <input className="input" value={builder.offer} onChange={(e) => updateBuilder("offer", e.target.value)} placeholder="Offer" />
            <textarea className="input" rows={3} value={builderPrompt} readOnly />
          </div>
          <div className="mini" style={{ marginTop: 8, opacity: 0.82 }}>
            Pro tip: usa Builder Prompt como base, luego ajusta detalles en Runway Prompt con contexto del mercado y señal Delta.
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Runway Gen-4.5 Video Lab</h2>
            <div className="cardSubtitle">Genera el video creativo y visualízalo directamente en este dashboard.</div>
          </div>
          <div className="cardHeaderActions">
            <button className="smallBtn" type="button" onClick={refreshVideoStatus} disabled={!videoGen?.id || videoBusy}>
              Refresh Status
            </button>
            <button className="smallBtn aiBtn" type="button" onClick={createRunwayVideo} disabled={videoBusy || !runwayPrompt.trim()}>
              {videoBusy ? "Generating..." : "Generate Video"}
            </button>
          </div>
        </div>
        <div className="cardBody">
          <div className="moduleGrid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <div className="moduleCard">
              <p className="l moduleTitle">Model</p>
              <input className="input" value={runwayModel} onChange={(e) => setRunwayModel(e.target.value)} />
              <p className="mini" style={{ marginTop: 8, opacity: 0.8 }}>Examples: `gen4.5`, `gen4_turbo`, `veo3.1`.</p>
            </div>
            <div className="moduleCard">
              <p className="l moduleTitle">Aspect Ratio</p>
              <input className="input" value={runwayRatio} onChange={(e) => setRunwayRatio(e.target.value)} placeholder="1280:720" />
            </div>
            <div className="moduleCard">
              <p className="l moduleTitle">Duration (sec)</p>
              <input className="input" type="number" min={5} max={30} value={runwayDuration} onChange={(e) => setRunwayDuration(e.target.value)} />
            </div>
            <div className="moduleCard">
              <p className="l moduleTitle">Seed Image URL (optional)</p>
              <input className="input" value={seedImageUrl} onChange={(e) => setSeedImageUrl(e.target.value)} placeholder="https://.../frame.jpg" />
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <p className="l moduleTitle">Runway Prompt</p>
            <textarea
              className="input"
              rows={5}
              value={runwayPrompt}
              onChange={(e) => setRunwayPrompt(e.target.value)}
              placeholder="Describe shot sequence, style, talent, camera movement, overlays and CTA."
            />
          </div>

          {videoErr ? <div className="mini" style={{ color: "var(--danger)", marginTop: 8 }}>X {videoErr}</div> : null}
          {videoGen ? (
            <div style={{ marginTop: 10 }}>
              <div className="mini" style={{ marginBottom: 8 }}>
                Generation ID: <b>{s(videoGen.id) || "-"}</b> · Status: <b>{s(videoGen.status) || "queued"}</b> · Model: <b>{s(videoGen.model) || runwayModel}</b>
              </div>
              {s(videoGen.outputUrl) ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <video
                    src={s(videoGen.outputUrl)}
                    controls
                    style={{ width: "100%", maxHeight: 520, borderRadius: 12, border: "1px solid rgba(148,163,184,.25)" }}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="smallBtn" type="button" onClick={downloadVideo}>Download Video</button>
                    <a className="smallBtn" href={s(videoGen.outputUrl)} target="_blank" rel="noreferrer">Open Video URL</a>
                  </div>
                </div>
              ) : (
                <div className="mini" style={{ opacity: 0.82 }}>Video aún en proceso. Usa `Refresh Status` o espera auto-refresh.</div>
              )}
            </div>
          ) : null}
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">YouTube Ads Campaign Composer</h2>
            <div className="cardSubtitle">UI completa para campaign setup, preview de creative y payload listo para publicar (vía OpenClaw approval).</div>
          </div>
          <div className="cardHeaderActions">
            <button className="smallBtn aiBtn" type="button" onClick={queueCampaignForApproval} disabled={proposalBusy || !tenantId}>
              {proposalBusy ? "Queueing..." : "Send to Notification Hub"}
            </button>
          </div>
        </div>
        <div className="cardBody">
          <div className="moduleGrid" style={{ gridTemplateColumns: "1.15fr 1fr" }}>
            <div className="moduleCard">
              <p className="l moduleTitle">YouTube Ad Preview</p>
              <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(148,163,184,.22)", background: "#0b1220" }}>
                <div style={{ aspectRatio: "16/9", width: "100%", background: "#000" }}>
                  {s(videoGen?.outputUrl) ? (
                    <video src={s(videoGen?.outputUrl)} controls style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "rgba(148,163,184,.9)" }}>No video generated yet</div>
                  )}
                </div>
                <div style={{ padding: 12, background: "rgba(2,6,23,.8)" }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>{campaign.headline || "Ad headline"}</p>
                  <p className="mini" style={{ margin: "6px 0 0" }}>{campaign.displayUrl || "display.url"}</p>
                  <p className="mini" style={{ margin: "6px 0 0", opacity: 0.9 }}>{campaign.description1}</p>
                  <div style={{ marginTop: 10 }}>
                    <span className="badge">CTA: {campaign.cta || "Book now"}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="moduleCard">
              <p className="l moduleTitle">Campaign Core</p>
              <div style={{ display: "grid", gap: 8 }}>
                <input className="input" value={campaign.campaignName} onChange={(e) => updateCampaign("campaignName", e.target.value)} placeholder="Campaign name" />
                <input className="input" value={campaign.adGroupName} onChange={(e) => updateCampaign("adGroupName", e.target.value)} placeholder="Ad group name" />
                <select className="input" value={campaign.objective} onChange={(e) => updateCampaign("objective", e.target.value)}>
                  <option>Leads</option>
                  <option>Bookings</option>
                  <option>Retargeting</option>
                </select>
                <input className="input" value={campaign.dailyBudgetUsd} onChange={(e) => updateCampaign("dailyBudgetUsd", e.target.value)} placeholder="Daily budget USD" />
                <input className="input" value={campaign.biddingStrategy} onChange={(e) => updateCampaign("biddingStrategy", e.target.value)} placeholder="Bidding strategy" />
                <input className="input" value={campaign.targetCpaUsd} onChange={(e) => updateCampaign("targetCpaUsd", e.target.value)} placeholder="Target CPA USD" />
                <input className="input" value={campaign.targetRoas} onChange={(e) => updateCampaign("targetRoas", e.target.value)} placeholder="Target ROAS" />
              </div>
            </div>
          </div>

          <div className="moduleGrid" style={{ marginTop: 10 }}>
            <div className="moduleCard">
              <p className="l moduleTitle">Targeting</p>
              <div style={{ display: "grid", gap: 8 }}>
                <input className="input" value={campaign.region} onChange={(e) => updateCampaign("region", e.target.value)} placeholder="Geo target" />
                <input className="input" value={campaign.languages} onChange={(e) => updateCampaign("languages", e.target.value)} placeholder="Languages" />
                <input className="input" value={campaign.inventoryType} onChange={(e) => updateCampaign("inventoryType", e.target.value)} placeholder="Inventory type" />
                <input className="input" value={campaign.devices} onChange={(e) => updateCampaign("devices", e.target.value)} placeholder="Devices" />
                <textarea className="input" rows={2} value={campaign.audiences} onChange={(e) => updateCampaign("audiences", e.target.value)} placeholder="Audiences" />
                <textarea className="input" rows={2} value={campaign.keywords} onChange={(e) => updateCampaign("keywords", e.target.value)} placeholder="Keywords" />
                <textarea className="input" rows={2} value={campaign.placements} onChange={(e) => updateCampaign("placements", e.target.value)} placeholder="Placements" />
              </div>
            </div>

            <div className="moduleCard">
              <p className="l moduleTitle">Ad Asset + Tracking</p>
              <div style={{ display: "grid", gap: 8 }}>
                <input className="input" value={campaign.finalUrl} onChange={(e) => updateCampaign("finalUrl", e.target.value)} placeholder="Final URL" />
                <input className="input" value={campaign.displayUrl} onChange={(e) => updateCampaign("displayUrl", e.target.value)} placeholder="Display URL" />
                <input className="input" value={campaign.cta} onChange={(e) => updateCampaign("cta", e.target.value)} placeholder="CTA" />
                <input className="input" value={campaign.headline} onChange={(e) => updateCampaign("headline", e.target.value)} placeholder="Headline" />
                <input className="input" value={campaign.longHeadline} onChange={(e) => updateCampaign("longHeadline", e.target.value)} placeholder="Long headline" />
                <textarea className="input" rows={2} value={campaign.description1} onChange={(e) => updateCampaign("description1", e.target.value)} placeholder="Description 1" />
                <textarea className="input" rows={2} value={campaign.description2} onChange={(e) => updateCampaign("description2", e.target.value)} placeholder="Description 2" />
                <input className="input" value={campaign.trackingTemplate} onChange={(e) => updateCampaign("trackingTemplate", e.target.value)} placeholder="Tracking template" />
                <input className="input" value={campaign.utmCampaign} onChange={(e) => updateCampaign("utmCampaign", e.target.value)} placeholder="UTM campaign" />
                <input className="input" value={campaign.utmContent} onChange={(e) => updateCampaign("utmContent", e.target.value)} placeholder="UTM content" />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <p className="l moduleTitle">Publish Payload (future YouTube Ads API)</p>
            <textarea className="input" rows={12} readOnly value={JSON.stringify(campaignPayloadPreview, null, 2)} />
          </div>

          {proposalErr ? <div className="mini" style={{ color: "var(--danger)", marginTop: 8 }}>X {proposalErr}</div> : null}
          {proposalMsg ? <div className="mini" style={{ color: "rgba(74,222,128,.95)", marginTop: 8 }}>✓ {proposalMsg}</div> : null}
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Campaign Planner (YouTube Ads)</h2>
            <div className="cardSubtitle">Playbooks por estado con hook creativo y guion para video ad.</div>
          </div>
          <div className="cardHeaderActions">
            <button className="smallBtn" type="button" onClick={exportPlaybooksCsv} disabled={!playbooks.length}>
              Export CSV
            </button>
            <div className="badge">{playbooks.length} playbooks</div>
          </div>
        </div>
        <div className="cardBody">
          <div className="moduleGrid">
            {playbooks.map((pb, idx) => (
              <div className="moduleCard" key={`${pb.region}-${idx}`}>
                <div className="moduleTop">
                  <p className="l moduleTitle">{pb.region}</p>
                  <span className="mini moduleDelta">{pb.objective}</span>
                </div>
                <p className="mini moduleLine"><b>Budget/day:</b> {fmtMoney(pb.dailyBudget)}</p>
                <p className="mini moduleLine"><b>Audience:</b> {pb.audience}</p>
                <p className="mini moduleLine"><b>Hook:</b> {pb.hook}</p>
                <p className="mini moduleLine"><b>Script 15s:</b> {pb.script15s}</p>
                <p className="mini moduleLine"><b>Script 30s:</b> {pb.script30s}</p>
                <p className="mini moduleLine"><b>CTA:</b> {pb.cta}</p>
                <p className="mini moduleLine"><b>Runway prompt:</b> {pb.runwayPrompt}</p>
                <div style={{ marginTop: 8 }}>
                  <button className="smallBtn" type="button" onClick={() => applyPlaybookToComposer(pb)}>Use in Composer</button>
                </div>
              </div>
            ))}
          </div>
          {!playbooks.length ? <div className="mini" style={{ opacity: 0.8 }}>No hay data suficiente para generar playbooks.</div> : null}
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">AI Strategist (YouTube Ads)</h2>
            <div className="cardSubtitle">Agente con memoria compartida para estrategia, scripts y mejoras creativas.</div>
          </div>
          <div className="badge">agent: {youtubeAgentId}</div>
        </div>
        <div className="cardBody">
          <AiAgentChatPanel
            agent="youtube_ads"
            title="YouTube Ads Agent Chat"
            context={{
              preset,
              start,
              end,
              range: data?.range,
              executive: data?.executive,
              topOpportunitiesGeo: data?.topOpportunitiesGeo,
              attribution: data?.attribution,
              actionCenter: data?.actionCenter,
              campaignPlaybooks: playbooks,
              productsServices: serviceCatalog,
              selectedService,
              aiPlaybook,
              runwayPrompt,
              runwayModel,
              runwayRatio,
              runwayDuration,
              seedImageUrl,
              runwayGeneration: videoGen,
              promptBuilder: builder,
              campaign,
              payloadPreview: campaignPayloadPreview,
            }}
          />
        </div>
      </section>
    </div>
  );
}
