export type AdCreative = {
  actor_id?: string;
  effective_object_story_id?: string;
  object_story_spec?: { page_id?: string } | string | null;
};

/** Page id trên creative của ads. Insights không trả page, nên lấy từ creative. */
export function pageIdFromCreative(creative: AdCreative | null | undefined): string | null {
  if (!creative) return null;

  const spec = creative.object_story_spec;
  if (spec && typeof spec === "object") {
    const pageId = spec.page_id?.trim();
    if (pageId) return pageId;
  }
  if (typeof spec === "string" && spec.trim()) {
    try {
      const parsed = JSON.parse(spec) as { page_id?: string };
      const pageId = parsed.page_id?.trim();
      if (pageId) return pageId;
    } catch {
      // Creative spec đôi khi không phải JSON.
    }
  }

  const actorId = creative.actor_id?.trim();
  if (actorId && /^\d{5,}$/.test(actorId)) return actorId;

  const storyPrefix = creative.effective_object_story_id?.split("_")[0]?.trim();
  if (storyPrefix && /^\d{5,}$/.test(storyPrefix)) return storyPrefix;
  return null;
}
