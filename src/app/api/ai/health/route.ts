import { NextResponse } from "next/server";

import { getModelId, getProvider, isAiConfigured, PROVIDERS } from "@/lib/ai/model";

export const runtime = "nodejs";

/**
 * Kiểm tra nhanh cấu hình AI: provider nào, model nào, key đã có chưa, và với
 * Google thì liệt kê luôn các model tài khoản được phép dùng — danh sách này
 * khác nhau theo thời điểm tạo tài khoản. Không bao giờ trả về giá trị API key.
 */
export async function GET() {
  const provider = getProvider();
  const modelId = getModelId(provider);
  const configured = isAiConfigured(provider);

  const base = {
    provider,
    providerLabel: PROVIDERS[provider].label,
    model: modelId,
    configured,
  };

  if (!configured || provider !== "google") {
    return NextResponse.json(base);
  }

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": process.env.GOOGLE_GENERATIVE_AI_API_KEY! },
    });
    if (!response.ok) {
      return NextResponse.json({ ...base, error: `Google trả về ${response.status}` });
    }

    const data = (await response.json()) as {
      models?: { name: string; supportedGenerationMethods?: string[] }[];
    };

    const availableModels = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .sort();

    return NextResponse.json({ ...base, availableModels, modelIsListed: availableModels.includes(modelId) });
  } catch (error) {
    return NextResponse.json({ ...base, error: error instanceof Error ? error.message : "lỗi không xác định" });
  }
}
