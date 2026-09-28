"use client";

import * as React from "react";
import { Loader2, Send, Sparkles, X } from "lucide-react";

import { ExportPreviewCard } from "@/components/ai/export-preview-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ExportPreview } from "@/lib/ai/export-preview";
import type { ExportSpec } from "@/lib/ai/export-spec";
import { MENTION_TYPES, type ChatMention, type MentionType } from "@/lib/ai/stats-query";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  spec?: ExportSpec | null;
  preview?: ExportPreview | null;
}

const SUGGESTIONS = [
  "Tháng này có bao nhiêu lead? So với kỳ trước.",
  "Chi tiêu và CPL theo fanpage tháng này",
  "Lead CRM và lead quảng cáo theo từng fanpage",
  "Xuất lead Facebook tháng này, tách sheet theo phụ trách",
];

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Chào bạn. Mình đọc lead CRM và số quảng cáo trong đúng phạm vi fanpage của tài khoản. Hai loại số được trả riêng, không trộn với nhau.",
};

export function AiChatPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = React.useState("");
  const [mentions, setMentions] = React.useState<ChatMention[]>([]);
  const [mentionOpen, setMentionOpen] = React.useState(false);
  const [mentionType, setMentionType] = React.useState<MentionType | null>(null);
  const [mentionQuery, setMentionQuery] = React.useState("");
  const [mentionItems, setMentionItems] = React.useState<{ id: string; label: string; hint: string | null }[]>([]);
  const [mentionIndex, setMentionIndex] = React.useState(0);
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

  React.useEffect(() => {
    if (!mentionOpen || !mentionType) return;
    const handle = window.setTimeout(async () => {
      const response = await fetch(`/api/ai/mentions?type=${mentionType}&q=${encodeURIComponent(mentionQuery)}`);
      const data = await response.json();
      setMentionItems(Array.isArray(data.items) ? data.items : []);
      setMentionIndex(0);
    }, 150);
    return () => window.clearTimeout(handle);
  }, [mentionOpen, mentionType, mentionQuery]);

  const closeMentions = () => {
    setMentionOpen(false);
    setMentionType(null);
    setMentionItems([]);
  };

  const chooseMention = (item: { id: string; label: string }) => {
    if (!mentionType) return;
    setMentions((current) => [...current, { type: mentionType, id: item.id, label: item.label }]);
    setInput((current) => current.replace(/(?:^|\s)@[^\s@]*$/, "").trimEnd());
    closeMentions();
  };
  const send = async (text: string, tagged: ChatMention[] = mentions) => {
    const trimmed = text.trim();
    if ((!trimmed && tagged.length === 0) || loading) return;

    const shown = [trimmed, ...tagged.map((item) => `@${item.label}`)].filter(Boolean).join(" ");
    const userMessage: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: shown };
    const history = [...messages, userMessage];
    setMessages(history);
    setInput("");
    setMentions([]);
    closeMentions();
    setLoading(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history
            .filter((m) => m.id !== "welcome")
            .map((m) => ({ role: m.role, content: m.content })),
          mentions: tagged,
        }),
      });
      const data = await response.json();
      setMode(data.mode ?? null);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.reply ?? data.error ?? "Mình chưa xử lý được yêu cầu này.",
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
              ? "Đang trả lời từ số liệu CRM — chưa cấu hình API key"
              : mode === "ai"
                ? "Số liệu lấy từ CRM theo quyền tài khoản"
                : "Hỏi số liệu hoặc nhờ xuất file"}
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
              Đang đọc số liệu…
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

        <div className="relative border-t border-border p-3">
          {mentionOpen && (
            <div className="absolute bottom-full left-3 right-3 z-10 mb-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-lg">
              <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground">
                {mentionType ? "Chọn mục" : "Chọn loại"}
              </div>
              {(mentionType ? mentionItems : MENTION_TYPES).map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "flex w-full flex-col px-3 py-1.5 text-left text-[13px]",
                    index === mentionIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                  )}
                  onMouseEnter={() => setMentionIndex(index)}
                  onClick={() => {
                    if (!mentionType) {
                      setMentionType(item.id as MentionType);
                      setMentionIndex(0);
                      return;
                    }
                    chooseMention(item);
                  }}
                >
                  <span>{item.label}</span>
                  {"hint" in item && item.hint ? <span className="text-[11px] text-muted-foreground">{item.hint}</span> : null}
                </button>
              ))}
              {mentionType && mentionItems.length === 0 && (
                <div className="px-3 py-2 text-[12px] text-muted-foreground">Không có mục khớp.</div>
              )}
            </div>
          )}
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5">
              {mentions.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1">
                  {mentions.map((item) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                      onClick={() => setMentions((current) => current.filter((mention) => mention.id !== item.id))}
                    >
                      @{item.label} ×
                    </button>
                  ))}
                </div>
              )}
              <Textarea
                value={input}
                onChange={(e) => {
                  const next = e.target.value;
                  setInput(next);
                  const match = /(?:^|\s)@([^\s@]*)$/.exec(next);
                  if (match) {
                    setMentionOpen(true);
                    setMentionQuery(match[1] ?? "");
                  } else {
                    closeMentions();
                  }
                }}
                onKeyDown={(e) => {
                  const options = mentionType ? mentionItems : MENTION_TYPES;
                  if (mentionOpen && e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    closeMentions();
                    return;
                  }
                  if (mentionOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                    e.preventDefault();
                    setMentionIndex((current) => {
                      if (options.length === 0) return 0;
                      return e.key === "ArrowDown" ? (current + 1) % options.length : (current - 1 + options.length) % options.length;
                    });
                    return;
                  }
                  if (mentionOpen && e.key === "Enter") {
                    e.preventDefault();
                    const option = options[mentionIndex];
                    if (!option) return;
                    if (!mentionType) {
                      setMentionType(option.id as MentionType);
                      setMentionIndex(0);
                      return;
                    }
                    chooseMention(option);
                    return;
                  }
                  if (e.key === "Backspace" && input === "" && mentions.length > 0) {
                    e.preventDefault();
                    setMentions((current) => current.slice(0, -1));
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder="Hỏi số liệu, gõ @ để chọn chiến dịch, quảng cáo, lead…"
                className="min-h-11 resize-none border-0 p-0 text-[13px] shadow-none focus-visible:ring-0"
                rows={2}
              />
            </div>
            <Button size="icon" onClick={() => send(input)} disabled={loading || (!input.trim() && mentions.length === 0)}>
              <Send className="size-4" />
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Gõ @ để gắn đúng mục. Số liệu lấy theo quyền tài khoản, không do AI bịa.
          </p>
        </div>
      </aside>
    </>
  );
}
