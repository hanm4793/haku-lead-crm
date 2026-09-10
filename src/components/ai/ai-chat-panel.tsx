"use client";

import * as React from "react";
import { Loader2, Send, Sparkles, X } from "lucide-react";

import { ExportPreviewCard } from "@/components/ai/export-preview-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ExportPreview } from "@/lib/ai/export-preview";
import type { ExportSpec } from "@/lib/ai/export-spec";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  spec?: ExportSpec | null;
  preview?: ExportPreview | null;
}

const SUGGESTIONS = [
  "Xuất lead Facebook tháng này chưa lên B10, tách sheet theo phụ trách",
  "Xuất khách quan tâm dòng CX-5 30 ngày gần nhất",
  "Xuất danh sách khách bị loại tháng trước kèm lý do loại",
  "Xuất lead quá hạn gọi lại của showroom Long Biên",
];

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Chào bạn. Mình có thể tạo file export theo mô tả bằng lời. Cứ nói bạn cần lọc gì, cần cột nào, có tách sheet không — mình dựng cấu hình rồi bạn xem trước trước khi tải.",
};

export function AiChatPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [mode, setMode] = React.useState<"ai" | "fallback" | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: trimmed };
    const history = [...messages, userMessage];
    setMessages(history);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history
            .filter((m) => m.id !== "welcome")
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await response.json();
      setMode(data.mode ?? null);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.reply ?? "Mình chưa xử lý được yêu cầu này.",
          spec: data.spec ?? null,
          preview: data.preview ?? null,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: `Không kết nối được tới trợ lý: ${error instanceof Error ? error.message : "lỗi không xác định"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-slate-900/20" onClick={() => onOpenChange(false)} />}

      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-screen w-[440px] max-w-[92vw] flex-col border-l border-border bg-card shadow-2xl transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Trợ lý AI</div>
            <div className="text-[11px] text-muted-foreground">
              {mode === "fallback"
                ? "Chế độ từ khóa — chưa cấu hình API key"
                : "Export thông minh từ mô tả bằng lời"}
            </div>
          </div>
          <Button variant="ghost" size="iconSm" onClick={() => onOpenChange(false)}>
            <X className="size-4" />
          </Button>
        </header>

        <div ref={scrollRef} className="thin-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((message) => (
            <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[92%] space-y-2", message.role === "user" && "max-w-[85%]")}>
                <div
                  className={cn(
                    "whitespace-pre-wrap rounded-lg px-3 py-2 text-[13px] leading-relaxed",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-[#f3f6fb] text-slate-700",
                  )}
                >
                  {message.content}
                </div>
                {message.spec && message.preview && (
                  <ExportPreviewCard spec={message.spec} preview={message.preview} />
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Đang dựng cấu hình export…
            </div>
          )}

          {messages.length === 1 && (
            <div className="space-y-1.5 pt-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Thử hỏi</div>
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-left text-[12px] text-slate-600 transition-colors hover:border-primary hover:bg-accent hover:text-primary"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="VD: xuất lead KHQT tháng này của showroom Long Biên, tách sheet theo dòng xe"
              className="min-h-11 resize-none text-[13px]"
              rows={2}
            />
            <Button size="icon" onClick={() => send(input)} disabled={loading || !input.trim()}>
              <Send className="size-4" />
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            AI chỉ tạo cấu hình lọc — dữ liệu khách hàng không được gửi ra ngoài.
          </p>
        </div>
      </aside>
    </>
  );
}
