"use client";

import * as React from "react";
import {
  AtSign,
  Building2,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  MapPin,
  Megaphone,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Tag,
  UserCheck,
  Users,
  X,
} from "lucide-react";

import { ExportPreviewCard } from "@/components/ai/export-preview-card";
import { MarketingDataCard } from "@/components/ai/marketing-data-card";
import { MiniBreakdownCard } from "@/components/ai/mini-breakdown-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ExportPreview } from "@/lib/ai/export-preview";
import type { ExportSpec } from "@/lib/ai/export-spec";
import { MENTION_TYPES, type ChatMention, type MentionType, type StatsBreakdownRow } from "@/lib/ai/stats-query";
import type { MarketingBreakdownRow } from "@/lib/db/insights-repo";
import { cn } from "@/lib/utils";

export interface ChatSuggestion {
  label: string;
  prompt: string;
  mentions?: ChatMention[];
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  spec?: ExportSpec | null;
  preview?: ExportPreview | null;
  breakdown?: StatsBreakdownRow[] | null;
  marketingRows?: MarketingBreakdownRow[] | null;
  suggestions?: (string | ChatSuggestion)[];
}

interface MentionItem {
  id: string;
  label: string;
  type: MentionType;
  categoryLabel?: string;
  hint: string | null;
}

const CATEGORY_META: Record<
  MentionType,
  { label: string; desc: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  product: {
    label: "Sản phẩm / Dòng xe",
    desc: "Sản phẩm khách quan tâm (Seltos, Carnival, 2008...)",
    icon: Car,
    color: "text-sky-600 bg-sky-50 border-sky-200",
  },
  fanpage: {
    label: "Fanpage",
    desc: "Trang Facebook tiếp nhận lead quảng cáo",
    icon: Building2,
    color: "text-blue-600 bg-blue-50 border-blue-200",
  },
  campaign: {
    label: "Chiến dịch quảng cáo",
    desc: "Chiến dịch Meta Ads theo tháng hoặc khu vực",
    icon: Target,
    color: "text-amber-600 bg-amber-50 border-amber-200",
  },
  brand: {
    label: "Thương hiệu",
    desc: "Hãng / Thương hiệu (Kia, Mazda, Peugeot, BMW...)",
    icon: Tag,
    color: "text-purple-600 bg-purple-50 border-purple-200",
  },
  assignee: {
    label: "Nhân viên phụ trách",
    desc: "Nhân viên kinh doanh trong CRM",
    icon: UserCheck,
    color: "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
  location: {
    label: "Showroom / Địa điểm",
    desc: "Chi nhánh tiếp nhận và phục vụ khách",
    icon: MapPin,
    color: "text-orange-600 bg-orange-50 border-orange-200",
  },
  ad: {
    label: "Bài quảng cáo cụ thể",
    desc: "Mẫu quảng cáo chạy trên Meta",
    icon: Megaphone,
    color: "text-rose-600 bg-rose-50 border-rose-200",
  },
  lead: {
    label: "Khách hàng (Lead)",
    desc: "Tìm nhanh theo tên khách hoặc SĐT",
    icon: Users,
    color: "text-slate-600 bg-slate-100 border-slate-200",
  },
};

function Target({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

const TOPIC_SUGGESTIONS = [
  {
    group: "Báo cáo Lead CRM",
    items: [
      "Tháng này có bao nhiêu lead? So với kỳ trước.",
      "Xem chi tiết phân bổ lead theo từng fanpage",
      "Tỷ lệ liên hệ và KHQT theo nhân viên kinh doanh",
    ],
  },
  {
    group: "Marketing & Facebook Ads",
    items: [
      "Chi tiêu và CPL theo từng fanpage tháng này",
      "Quảng cáo nào đang thu về nhiều lead nhất?",
      "Đối chiếu lead CRM và lead trên báo cáo quảng cáo",
    ],
  },
  {
    group: "Xuất dữ liệu Excel",
    items: [
      "Xuất file lead Facebook tháng này, tách sheet theo phụ trách",
      "Xuất toàn bộ khách hàng quan tâm (KHQT) ra file excel",
    ],
  },
];

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Chào bạn! Tôi là Trợ lý AI của SEMTOP CRM. Bạn có thể hỏi số liệu CRM, chi phí quảng cáo hoặc nhờ tôi chuẩn bị file Excel/CSV theo yêu cầu.",
};

export function AiChatPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = React.useState("");
  const [mentions, setMentions] = React.useState<ChatMention[]>([]);

  // Menu @ hierarchical state:
  // step = "categories": Hiện danh sách 8 danh mục lớn, KHÔNG gọi API.
  // step = "items": Đã chọn 1 danh mục, gọi API tìm kiếm các mục trong danh mục đó.
  // step = "global_search": Người dùng gõ từ khóa trực tiếp sau @, gọi API tìm kiếm toàn bộ.
  const [mentionOpen, setMentionOpen] = React.useState(false);
  const [mentionStep, setMentionStep] = React.useState<"categories" | "items" | "global_search">("categories");
  const [selectedCategory, setSelectedCategory] = React.useState<MentionType | null>(null);
  const [mentionQuery, setMentionQuery] = React.useState("");
  const [mentionItems, setMentionItems] = React.useState<MentionItem[]>([]);
  const [mentionIndex, setMentionIndex] = React.useState(0);
  const [mentionLoading, setMentionLoading] = React.useState(false);

  const [loading, setLoading] = React.useState(false);
  const [mode, setMode] = React.useState<"ai" | "fallback" | null>(null);
  const [lastSpec, setLastSpec] = React.useState<ExportSpec | null>(null);
  const [lastMentions, setLastMentions] = React.useState<ChatMention[]>([]);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Chỉ fetch API khi ở step "items" hoặc "global_search"
  React.useEffect(() => {
    if (!mentionOpen || mentionStep === "categories") return;

    setMentionLoading(true);
    const targetType = mentionStep === "items" && selectedCategory ? selectedCategory : "all";
    const handle = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/ai/mentions?type=${targetType}&q=${encodeURIComponent(mentionQuery)}`,
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
  }, [mentionOpen, mentionStep, selectedCategory, mentionQuery]);

  const closeMentions = () => {
    setMentionOpen(false);
    setMentionStep("categories");
    setSelectedCategory(null);
    setMentionQuery("");
    setMentionItems([]);
    setMentionIndex(0);
  };

  const openCategoriesMenu = () => {
    setMentionOpen(true);
    setMentionStep("categories");
    setSelectedCategory(null);
    setMentionQuery("");
    setMentionItems([]);
    setMentionIndex(0);
  };

  const pickCategory = (type: MentionType) => {
    setSelectedCategory(type);
    setMentionStep("items");
    setMentionQuery("");
    setMentionItems([]);
    setMentionIndex(0);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const chooseMention = (item: MentionItem) => {
    setMentions((current) => [...current, { type: item.type, id: item.id, label: item.label }]);
    setInput((current) => current.replace(/(?:^|\s)@[^\n@]*$/, "").trimEnd());
    closeMentions();
  };

  const resetChat = () => {
    setMessages([WELCOME_MESSAGE]);
    setMentions([]);
    setLastSpec(null);
    setLastMentions([]);
    closeMentions();
  };

  const copyText = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
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
          lastMentions,
        }),
      });
      const data = await response.json();
      setMode(data.mode ?? null);
      if (data.spec) {
        setLastSpec(data.spec);
      }
      if (data.activeMentions && data.activeMentions.length > 0) {
        setLastMentions(data.activeMentions);
      } else if (tagged.length > 0) {
        setLastMentions(tagged);
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
          marketingRows: data.marketingRows ?? null,
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
      {open && <div className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-xs" onClick={() => onOpenChange(false)} />}

      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-screen w-[460px] max-w-[94vw] flex-col border-l border-border bg-card shadow-2xl transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header hiện đại */}
        <header className="flex items-center justify-between border-b border-border bg-card/80 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
              <Sparkles className="size-4.5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">Trợ lý AI</span>
                {mode === "ai" && (
                  <span className="rounded-full bg-emerald-50 px-1.5 py-0.2 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                    Live CRM
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Đọc dữ liệu CRM & Ads theo đúng phân quyền
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="iconSm"
              onClick={resetChat}
              title="Làm mới cuộc trò chuyện"
              className="text-muted-foreground hover:text-slate-800"
            >
              <RotateCcw className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="iconSm"
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-slate-800"
            >
              <X className="size-4" />
            </Button>
          </div>
        </header>

        {/* Nội dung tin nhắn */}
        <div ref={scrollRef} className="thin-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex flex-col", message.role === "user" ? "items-end" : "items-start")}
            >
              <div
                className={cn(
                  "group relative max-w-[88%] space-y-2 rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-2xs",
                  message.role === "user"
                    ? "rounded-br-xs bg-primary text-primary-foreground font-medium"
                    : "rounded-tl-xs border border-border/80 bg-slate-50/80 text-slate-800",
                )}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>

                {/* Card biểu đồ breakdown */}
                {message.breakdown && message.breakdown.length > 0 && (
                  <MiniBreakdownCard rows={message.breakdown} />
                )}

                {/* Card chi tiết marketing & link bài quảng cáo */}
                {message.marketingRows && message.marketingRows.length > 0 && (
                  <MarketingDataCard rows={message.marketingRows} />
                )}

                {/* Card xem trước export */}
                {message.spec && message.preview && (
                  <ExportPreviewCard spec={message.spec} preview={message.preview} />
                )}

                {/* Nút copy câu trả lời của AI */}
                {message.role === "assistant" && message.id !== "welcome" && (
                  <div className="flex justify-end pt-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => copyText(message.id, message.content)}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
                    >
                      {copiedId === message.id ? (
                        <>
                          <Check className="size-3 text-emerald-600" />
                          <span>Đã sao chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3" />
                          <span>Sao chép</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Follow-up suggestions */}
              {message.role === "assistant" && message.suggestions && message.suggestions.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 pl-1">
                  {message.suggestions.map((suggestion, idx) => {
                    const item: ChatSuggestion =
                      typeof suggestion === "string"
                        ? { label: suggestion, prompt: suggestion, mentions: lastMentions }
                        : suggestion;
                    const effectiveTagged =
                      item.mentions && item.mentions.length > 0 ? item.mentions : lastMentions;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => send(item.prompt, effectiveTagged)}
                        className="flex items-center gap-1 rounded-full border border-primary/25 bg-primary/5 px-2.5 py-1 text-left text-[11px] font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground shadow-2xs"
                      >
                        {effectiveTagged.length > 0 && (
                          <span className="rounded bg-primary/15 px-1 py-0.2 text-[9.5px] font-semibold text-primary group-hover:bg-primary-foreground group-hover:text-primary">
                            @{effectiveTagged[0]?.label}
                          </span>
                        )}
                        <span>{item.label}</span>
                        <ChevronRight className="size-3 opacity-60" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {/* Gợi ý câu hỏi khi mới mở chat */}
          {messages.length === 1 && (
            <div className="mt-4 space-y-4 pt-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Gợi ý câu hỏi phổ biến
              </div>
              {TOPIC_SUGGESTIONS.map((topic) => (
                <div key={topic.group} className="space-y-1.5">
                  <div className="text-[11.5px] font-medium text-slate-700">{topic.group}</div>
                  <div className="space-y-1">
                    {topic.items.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => send(item)}
                        className="w-full rounded-lg border border-border/80 bg-background px-3 py-2 text-left text-[12px] text-slate-600 transition-colors hover:border-primary/50 hover:bg-accent/50 hover:text-primary shadow-2xs"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              Đang phân tích và truy vấn CRM…
            </div>
          )}
        </div>

        {/* Khung nhập liệu + Menu @ thông minh 2 bước */}
        <div className="relative border-t border-border bg-card p-3">
          {/* POPUP @ MENUS */}
          {mentionOpen && (
            <div className="absolute bottom-full left-3 right-3 z-30 mb-2 overflow-hidden rounded-xl border border-border bg-card shadow-2xl ring-1 ring-black/5">
              {/* BƯỚC 1: DANH SÁCH CATEGORY (MỞ TỨC THÌ, KHÔNG LOAD API) */}
              {mentionStep === "categories" && (
                <div className="p-1.5">
                  <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60">
                    <span>Chọn đối tượng muốn hỏi</span>
                    <button
                      type="button"
                      onClick={closeMentions}
                      className="text-muted-foreground hover:text-slate-800"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>

                  <div className="max-h-72 overflow-y-auto py-1 space-y-0.5 thin-scrollbar">
                    {MENTION_TYPES.map((cat, index) => {
                      const meta = CATEGORY_META[cat.id];
                      const Icon = meta.icon;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors",
                            index === mentionIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                          )}
                          onMouseEnter={() => setMentionIndex(index)}
                          onClick={() => pickCategory(cat.id)}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={cn(
                                "flex size-6.5 shrink-0 items-center justify-center rounded-md border text-[11px]",
                                meta.color,
                              )}
                            >
                              <Icon className="size-3.5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-slate-800">{meta.label}</div>
                              <div className="truncate text-[10.5px] text-muted-foreground">{meta.desc}</div>
                            </div>
                          </div>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* BƯỚC 2: TÌM KIẾM TRONG DANH MỤC ĐÃ CHỌN (HOẶC TÌM KIẾM TOÀN BỘ KHI GÕ TIẾP) */}
              {(mentionStep === "items" || mentionStep === "global_search") && (
                <div className="p-1.5 flex flex-col">
                  {/* Header popup có nút Back */}
                  <div className="flex items-center gap-2 border-b border-border/60 px-2 py-1.5">
                    {mentionStep === "items" && (
                      <button
                        type="button"
                        onClick={() => {
                          setMentionStep("categories");
                          setSelectedCategory(null);
                          setMentionQuery("");
                          setMentionItems([]);
                        }}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        <ChevronLeft className="size-3.5" />
                        <span>Quay lại</span>
                      </button>
                    )}

                    <div className="flex-1 flex items-center gap-1.5 rounded-md bg-slate-100/80 px-2 py-1 text-[12px]">
                      <Search className="size-3.5 text-muted-foreground" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={mentionQuery}
                        onChange={(e) => setMentionQuery(e.target.value)}
                        placeholder={
                          selectedCategory
                            ? `Tìm ${CATEGORY_META[selectedCategory].label.toLowerCase()}…`
                            : "Tìm sản phẩm, fanpage, chiến dịch…"
                        }
                        className="w-full bg-transparent outline-hidden text-[12px] placeholder:text-muted-foreground"
                      />
                      {mentionQuery && (
                        <button type="button" onClick={() => setMentionQuery("")}>
                          <X className="size-3 text-muted-foreground hover:text-slate-700" />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={closeMentions}
                      className="p-1 text-muted-foreground hover:text-slate-800"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>

                  {/* Danh sách items tìm được */}
                  <div className="max-h-60 overflow-y-auto py-1 thin-scrollbar">
                    {mentionLoading ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-[12.5px] text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin text-primary" />
                        Đang tải danh sách…
                      </div>
                    ) : mentionItems.length === 0 ? (
                      <div className="py-6 text-center text-[12px] text-muted-foreground">
                        {mentionQuery.trim()
                          ? `Không tìm thấy mục nào khớp «${mentionQuery}».`
                          : "Chưa có dữ liệu trong danh mục này."}
                      </div>
                    ) : (
                      mentionItems.map((item, index) => {
                        const meta = CATEGORY_META[item.type];
                        const Icon = meta?.icon ?? Tag;
                        return (
                          <button
                            key={`${item.type}-${item.id}`}
                            type="button"
                            className={cn(
                              "flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors",
                              index === mentionIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                            )}
                            onMouseEnter={() => setMentionIndex(index)}
                            onClick={() => chooseMention(item)}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span
                                className={cn(
                                  "flex size-5.5 shrink-0 items-center justify-center rounded border",
                                  meta?.color ?? "bg-slate-100 text-slate-700 border-slate-200",
                                )}
                              >
                                <Icon className="size-3" />
                              </span>
                              <span className="truncate font-medium text-slate-800">{item.label}</span>
                            </div>
                            {item.hint && (
                              <span className="shrink-0 text-[11px] text-muted-foreground font-normal">
                                {item.hint}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Ô nhập tin nhắn */}
          <div className="rounded-xl border border-input bg-background p-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            {/* Tag Pills đã gắn */}
            {mentions.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1">
                {mentions.map((item) => {
                  const meta = CATEGORY_META[item.type];
                  return (
                    <span
                      key={`${item.type}-${item.id}`}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium shadow-2xs",
                        meta?.color ?? "bg-primary/10 text-primary border-primary/20",
                      )}
                    >
                      <span>@{item.label}</span>
                      <button
                        type="button"
                        onClick={() => setMentions((current) => current.filter((m) => m.id !== item.id))}
                        className="rounded-full hover:bg-black/10 p-0.5"
                      >
                        <X className="size-2.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            <Textarea
              value={input}
              onChange={(e) => {
                const next = e.target.value;
                setInput(next);

                // Kiểm tra nếu người dùng vừa gõ @
                const match = /(?:^|\s)@([^\n@]{0,40})$/.exec(next);
                if (match) {
                  const query = match[1]?.trim() ?? "";
                  setMentionOpen(true);
                  if (query.length > 0) {
                    // Nếu gõ tiếp từ khóa (ví dụ @kia) -> chuyển thẳng sang tìm kiếm
                    setMentionStep("global_search");
                    setSelectedCategory(null);
                    setMentionQuery(query);
                  } else {
                    // Nếu vừa gõ bare @ -> hiện danh sách category ngay lập tức
                    setMentionStep("categories");
                    setSelectedCategory(null);
                    setMentionQuery("");
                  }
                } else {
                  closeMentions();
                }
              }}
              onKeyDown={(e) => {
                if (mentionOpen && e.key === "Escape") {
                  e.preventDefault();
                  closeMentions();
                  return;
                }
                if (mentionOpen && mentionStep === "categories") {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setMentionIndex((current) =>
                      e.key === "ArrowDown"
                        ? (current + 1) % MENTION_TYPES.length
                        : (current - 1 + MENTION_TYPES.length) % MENTION_TYPES.length,
                    );
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const cat = MENTION_TYPES[mentionIndex];
                    if (cat) pickCategory(cat.id);
                    return;
                  }
                }
                if (mentionOpen && (mentionStep === "items" || mentionStep === "global_search")) {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setMentionIndex((current) => {
                      if (mentionItems.length === 0) return 0;
                      return e.key === "ArrowDown"
                        ? (current + 1) % mentionItems.length
                        : (current - 1 + mentionItems.length) % mentionItems.length;
                    });
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const item = mentionItems[mentionIndex];
                    if (item) chooseMention(item);
                    return;
                  }
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
              placeholder="Hỏi số liệu, bấm nút @ hoặc gõ @ để chọn đối tượng…"
              className="min-h-12 w-full resize-none border-0 p-1 text-[13px] shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/80 leading-relaxed"
              rows={2}
            />

            {/* Thanh công cụ phụ dưới ô nhập */}
            <div className="flex items-center justify-between pt-1 border-t border-border/40">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (mentionOpen) closeMentions();
                    else openCategoriesMenu();
                  }}
                  className={cn(
                    "h-6.5 gap-1 px-2 text-[11.5px] font-medium text-slate-600 hover:bg-accent hover:text-primary",
                    mentionOpen && "bg-primary/10 text-primary",
                  )}
                >
                  <AtSign className="size-3.5" />
                  <span>Gắn đối tượng</span>
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10.5px] text-muted-foreground hidden sm:inline">
                  Enter để gửi, Shift+Enter xuống dòng
                </span>
                <Button
                  size="iconSm"
                  onClick={() => send(input)}
                  disabled={loading || (!input.trim() && mentions.length === 0)}
                  className="rounded-lg h-7 w-7"
                >
                  <Send className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
