import { NextResponse } from "next/server";
import { z } from "zod";

import { searchMentions } from "@/lib/ai/mention-search";
import { MENTION_TYPES } from "@/lib/ai/stats-query";
import { canUseAi } from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";

export const runtime = "nodejs";

const querySchema = z.object({
  type: z.enum(["all", ...MENTION_TYPES.map((item) => item.id)]).optional(),
  q: z.string().max(80).optional(),
});

export async function GET(request: Request) {
  const viewer = await getScopedViewer();
  if (!viewer) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canUseAi(viewer)) return NextResponse.json({ error: "Tài khoản này chưa được bật trợ lý AI." }, { status: 403 });

  const url = new URL(request.url);
  const rawType = url.searchParams.get("type");
  const parsed = querySchema.safeParse({
    type: rawType && rawType !== "" ? rawType : "all",
    q: url.searchParams.get("q") ?? "",
  });
  if (!parsed.success) return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 400 });

  const items = await searchMentions(
    viewer,
    parsed.data.type as (typeof MENTION_TYPES)[number]["id"] | "all",
    parsed.data.q ?? "",
  );
  return NextResponse.json({ items });
}
