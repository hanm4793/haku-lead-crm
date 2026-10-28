"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAiModelLabel, GOOGLE_AI_MODELS } from "@/lib/ai/model";

interface HealthResponse {
  provider: string;
  providerLabel: string;
  model: string;
  configured: boolean;
  availableModels?: string[];
  modelIsListed?: boolean;
  error?: string;
}

export function AiModelSelector({ defaultModelId }: { defaultModelId: string }) {
  const [selectedModel, setSelectedModel] = React.useState<string>(defaultModelId);
  const [checking, setChecking] = React.useState(false);
  const [health, setHealth] = React.useState<HealthResponse | null>(null);

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem("crm.ai.model");
      if (saved) setSelectedModel(saved);
    } catch {
      // ignore
    }
    const onModelChanged = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) setSelectedModel(detail);
    };
    window.addEventListener("crm:ai-model-changed", onModelChanged);
    return () => window.removeEventListener("crm:ai-model-changed", onModelChanged);
  }, []);

  const handleChangeModel = (modelId: string) => {
    setSelectedModel(modelId);
    try {
      window.localStorage.setItem("crm.ai.model", modelId);
      document.cookie = `crm_ai_model=${encodeURIComponent(modelId)}; path=/; max-age=31536000`;
      window.dispatchEvent(new CustomEvent("crm:ai-model-changed", { detail: modelId }));
    } catch {
      // ignore
    }
  };

  const handleCheckHealth = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/ai/health");
      const data = (await res.json()) as HealthResponse;
      setHealth(data);
    } catch {
      setHealth({
        provider: "google",
        providerLabel: "Google Gemini",
        model: selectedModel,
        configured: false,
        error: "Không kiểm tra được kết nối.",
      });
    } finally {
      setChecking(false);
    }
  };

  const activeOption = GOOGLE_AI_MODELS.find((m) => m.id === selectedModel);

  return (
    <div className="space-y-2.5 rounded-lg border border-border/80 bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-800">
          <Sparkles className="size-3.5 text-primary" />
          <span>Chọn Model AI trên CRM</span>
        </div>
        {activeOption?.badge && (
          <Badge variant="default" className="text-[10.5px]">
            {activeOption.badge}
          </Badge>
        )}
      </div>

      <select
        value={selectedModel}
        onChange={(e) => handleChangeModel(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-[13px] font-medium text-slate-800 shadow-2xs outline-hidden focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        {GOOGLE_AI_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} ({m.id}){m.badge ? ` — ${m.badge}` : ""}
          </option>
        ))}
      </select>

      {activeOption && (
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">{activeOption.description}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCheckHealth}
          disabled={checking}
          className="h-7 text-[11.5px]"
        >
          {checking ? (
            <>
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              Đang kiểm tra API…
            </>
          ) : (
            "Kiểm tra danh sách Model từ Google AI"
          )}
        </Button>

        {health && !health.error && health.availableModels && (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-emerald-700">
            <CheckCircle2 className="size-3.5" />
            Đã nhận {health.availableModels.length} model (sẵn sàng cho {getAiModelLabel(selectedModel)})
          </span>
        )}
        {health?.error && <span className="text-[11.5px] text-destructive">{health.error}</span>}
      </div>
    </div>
  );
}
