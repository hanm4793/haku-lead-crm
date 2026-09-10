import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

/**
 * Model gateway — đổi nhà cung cấp bằng biến môi trường, không sửa code.
 *
 * Groq / OpenRouter / DeepSeek / Ollama đều nói chuẩn OpenAI nên dùng chung
 * một adapter; riêng Google có SDK riêng để tận dụng structured output native.
 */
export type AiProvider = "google" | "groq" | "openrouter" | "deepseek" | "ollama";

interface ProviderConfig {
  label: string;
  defaultModel: string;
  /** Không cần key với model chạy tại chỗ. */
  apiKeyEnv: string | null;
  baseUrl?: string;
  docs: string;
}

export const PROVIDERS: Record<AiProvider, ProviderConfig> = {
  google: {
    label: "Google Gemini (AI Studio)",
    // Tài khoản mở sau 2026 không còn gọi được gemini-2.5-flash-lite.
    defaultModel: "gemini-3.1-flash-lite",
    apiKeyEnv: "GOOGLE_GENERATIVE_AI_API_KEY",
    docs: "https://aistudio.google.com/apikey",
  },
  groq: {
    label: "Groq",
    defaultModel: "openai/gpt-oss-20b",
    apiKeyEnv: "GROQ_API_KEY",
    baseUrl: "https://api.groq.com/openai/v1",
    docs: "https://console.groq.com/keys",
  },
  openrouter: {
    label: "OpenRouter",
    defaultModel: "google/gemini-2.5-flash-lite",
    apiKeyEnv: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
    docs: "https://openrouter.ai/keys",
  },
  deepseek: {
    label: "DeepSeek",
    defaultModel: "deepseek-chat",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    baseUrl: "https://api.deepseek.com/v1",
    docs: "https://platform.deepseek.com/api_keys",
  },
  ollama: {
    label: "Ollama (chạy tại chỗ)",
    defaultModel: "qwen3:8b",
    apiKeyEnv: null,
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
    docs: "https://ollama.com/download",
  },
};

/** USD trên 1 triệu token. Dùng để ước tính chi phí hiển thị trong app. */
const PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.0-flash-lite": { input: 0.075, output: 0.3 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3-flash-preview": { input: 0.5, output: 3.0 },
  "openai/gpt-oss-20b": { input: 0.075, output: 0.3 },
  "llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
  "deepseek-chat": { input: 0.14, output: 0.28 },
};

export interface ResolvedModel {
  provider: AiProvider;
  providerLabel: string;
  modelId: string;
  model: LanguageModel;
}

export function getProvider(): AiProvider {
  const raw = (process.env.AI_PROVIDER ?? "google").toLowerCase();
  return raw in PROVIDERS ? (raw as AiProvider) : "google";
}

export function getModelId(provider: AiProvider = getProvider()) {
  return process.env.AI_MODEL || PROVIDERS[provider].defaultModel;
}

/** Đã đủ cấu hình để gọi model thật hay chưa. */
export function isAiConfigured(provider: AiProvider = getProvider()) {
  const keyEnv = PROVIDERS[provider].apiKeyEnv;
  if (!keyEnv) return true;
  return Boolean(process.env[keyEnv]);
}

export function resolveModel(): ResolvedModel | null {
  const provider = getProvider();
  if (!isAiConfigured(provider)) return null;

  const config = PROVIDERS[provider];
  const modelId = getModelId(provider);

  if (provider === "google") {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
    return { provider, providerLabel: config.label, modelId, model: google(modelId) };
  }

  const client = createOpenAICompatible({
    name: provider,
    baseURL: config.baseUrl!,
    apiKey: config.apiKeyEnv ? process.env[config.apiKeyEnv] : "ollama",
  });

  return { provider, providerLabel: config.label, modelId, model: client(modelId) };
}

export function estimateCostUsd(modelId: string, inputTokens: number, outputTokens: number) {
  const price = PRICING[modelId];
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

export function getPricing(modelId: string) {
  return PRICING[modelId] ?? null;
}
