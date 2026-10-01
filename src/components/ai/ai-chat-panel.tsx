"use client";

import * as React from "react";
import { Loader2, Send, Sparkles, X } from "lucide-react";

import { ExportPreviewCard } from "@/components/ai/export-preview-card";
import { MiniBreakdownCard } from "@/components/ai/mini-breakdown-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ExportPreview } from "@/lib/ai/export-preview";
import type { ExportSpec } from "@/lib/ai/export-spec";
import { MENTION_TYPES, type ChatMention, type MentionType, type StatsBreakdownRow } from "@/lib/ai/stats-query";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  spec?: ExportSpec | null;
  preview?: ExportPreview | null;
  breakdown?: StatsBreakdownRow[] | null;
  suggestions?: string[];
}

interface MentionItem {
  id: string;
  label: string;
  type: MentionType;
  categoryLabel?: string;
  hint: string | null;
}

const CATEGORY_COLORS: Record<MentionType, string> = {
  brand: "bg-purple-50 text-purple-700 border-purple-200",
  product: "bg-sky-50 text-sky-700 border-sky-200",
  fanpage: "bg-blue-50 text-blue-700 border-blue-200",
  campaign: "bg-amber-50 text-amber-700 border-amber-200",
  assignee: "bg-emerald-50 text-emerald-700 border-emerald-200",
  location: "bg-orange-50 text-orange-700 border-orange-200",
  ad: "bg-rose-50 text-rose-700 border-rose-200",
  lead: "bg-slate-100 text-slate-700 border-slate-200",
};

const INITIAL_SUGGESTIONS = [
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
  suggestions: INITIAL_SUGGESTIONS,
};

export function AiChatPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = React.useState("");
  const [mentions, setMentions] = React.useState<ChatMention[]>([]);
  const [mentionOpen, setMentionOpen] = React.useState(false);
  const [mentionCategory, setMentionCategory] = React.useState<MentionType | "all">("all");
  const [mentionQuery, setMentionQuery] = React.useState("");
  const [mentionItems, setMentionItems] = React.useState<MentionItem[]>([]);
  const [mentionIndex, setMentionIndex] = React.useState(0);
  const [mentionLoading, setMentionLoading] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [mode, setMode] = React.useState<"ai" | "fallback" | null>(null);
  const [lastSpec, setLastSpec] = React.useState<ExportSpec | null>(null);
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
    if (!mentionOpen) return;
    setMentionLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/ai/mentions?type=${mentionCategory}&q=${encodeURIComponent(mentionQuery)}`,
        );
        const data = await response.json();
        setMentionItems(Array.isArray(data.items) ? data.items : []);
        setMentionIndex(0);
      } catch {
        setMentionItems([]);
      } finally {
        setMentionLoading(false);
      }
    }, 120);
    return () => window.clearTimeout(handle);
  }, [mentionOpen, mentionCategory, mentionQuery]);

  const closeMentions = () => {
    setMentionOpen(false);
    setMentionCategory("all");
    setMentionQuery("");
    setMentionItems([]);
  };

  const chooseMention = (item: MentionItem) => {
    setMentions((current) => [...current, { type: item.type, id: item.id, label: item.label }]);
    setInput((current) => current.replace(/(?:^|\s)@[^\n@]*$/, "").trimEnd());
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
          lastSpec,
        }),
      });
      const data = await response.json();
      setMode(data.mode ?? null);
      if (data.spec) {
        setLastSpec(data.spec);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.reply ?? data.error ?? "Mình chưa xử lý được yêu cầu này.",
          spec: data.spec ?? null,
          preview: data.preview ?? null,
          breakdown: data.breakdown ?? null,
          suggestions: data.suggestions ?? [],
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

                {/* Card biểu đồ tỷ lệ phân bổ khi có dữ liệu breakdown */}
                {message.breakdown && message.breakdown.length > 0 && (
                  <MiniBreakdownCard rows={message.breakdown} />
                )}

                {/* Card xem trước file export */}
                {message.spec && message.preview && (
                  <ExportPreviewCard spec={message.spec} preview={message.preview} />
                )}

                {/* Gợi ý các câu hỏi / hành động tiếp theo */}
                {message.role === "assistant" && message.suggestions && message.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {message.suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => send(suggestion)}
                        className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-left text-[11px] text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                      >
                        {suggestion} →
                      </button>
                    ))}
                  </div>
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
        </div>

        <div className="relative border-t border-border p-3">
          {mentionOpen && (
            <div className="absolute bottom-full left-3 right-3 z-10 mb-1 max-h-72 overflow-hidden rounded-lg border border-border bg-card shadow-xl flex flex-col">
              {/* Thanh lọc danh mục ngang */}
              <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-slate-50/80 px-2 py-1.5 text-[11px] thin-scrollbar shrink-0">
                <button
                  type="button"
                  onClick={() => setMentionCategory("all")}
                  className={cn(
                    "rounded-md px-2 py-0.5 font-medium whitespace-nowrap transition-colors",
                    mentionCategory === "all"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  Tất cả
                </button>
                {MENTION_TYPES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setMentionCategory(cat.id)}
                    className={cn(
                      "rounded-md px-2 py-0.5 font-medium whitespace-nowrap transition-colors",
                      mentionCategory === cat.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Danh sách kết quả */}
              <div className="max-h-60 overflow-y-auto py-1">
                {mentionLoading ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Đang tìm kiếm…
                  </div>
                ) : mentionItems.length === 0 ? (
                  <div className="px-3 py-3 text-[12px] text-muted-foreground">
                    {mentionQuery.trim()
                      ? `Không có mục nào khớp «${mentionQuery}».`
                      : "Không có mục nào trong danh mục này."}
                  </div>
                ) : (
                  mentionItems.map((item, index) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors",
                        index === mentionIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                      )}
                      onMouseEnter={() => setMentionIndex(index)}
                      onClick={() => chooseMention(item)}
                    >
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded border px-1.5 py-0.2 text-[10px] font-medium shrink-0",
                            CATEGORY_COLORS[item.type] ?? "bg-slate-100 text-slate-700 border-slate-200",
                          )}
                        >
                          {item.categoryLabel ?? item.type}
                        </span>
                        <span className="truncate font-medium text-slate-800">{item.label}</span>
                      </div>
                      {item.hint && (
                        <span className="text-[11px] text-muted-foreground shrink-0">{item.hint}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
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
                  const match = /(?:^|\s)@([^\n@]{0,40})$/.exec(next);
                  if (match) {
                    setMentionOpen(true);
                    setMentionQuery(match[1]?.trim() ?? "");
                  } else {
                    closeMentions();
                  }
                }}
                onKeyDown={(e) => {
                  if (mentionOpen && e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    closeMentions();
                    return;
                  }
                  if (mentionOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                    e.preventDefault();
                    setMentionIndex((current) => {
                      if (mentionItems.length === 0) return 0;
                      return e.key === "ArrowDown"
                        ? (current + 1) % mentionItems.length
                        : (current - 1 + mentionItems.length) % mentionItems.length;
                    });
                    return;
                  }
                  if (mentionOpen && e.key === "Enter") {
                    e.preventDefault();
                    const option = mentionItems[mentionIndex];
                    if (option) {
                      chooseMention(option);
                    }
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
                placeholder="Hỏi số liệu, gõ @ để tìm nhanh sản phẩm, chiến dịch, fanpage, nhân viên…"
                className="min-h-11 resize-none border-0 p-0 text-[13px] shadow-none focus-visible:ring-0"
                rows={2}
              />
            </div>
            <Button size="icon" onClick={() => send(input)} disabled={loading || (!input.trim() && mentions.length === 0)}>
              <Send className="size-4" />
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Gõ @ để gắn nhanh mục cần hỏi. Dữ liệu lấy đúng theo phân quyền tài khoản.
          </p>
        </div>
      </aside>
    </>
  );
}
