export function normalizeViText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface MentionCandidate {
  appUserId: string;
  fullName: string;
  email?: string | null;
}

/**
 * Tìm danh sách `appUserId` được `@mention` trong nội dung bình luận.
 * Hỗ trợ cả có dấu và không dấu (`@Nguyễn Văn A` hoặc `@nguyen van a`), cũng như `@email_prefix`.
 */
export function extractMentionedUserIds(
  commentContent: string,
  candidates: readonly MentionCandidate[],
): string[] {
  if (!commentContent.includes("@") || candidates.length === 0) return [];

  const normalizedComment = normalizeViText(commentContent);
  const matched = new Set<string>();

  // Sắp xếp tên dài trước để "@Nguyễn Văn An" khớp ưu tiên rõ ràng
  const sorted = [...candidates].sort((a, b) => b.fullName.length - a.fullName.length);

  for (const candidate of sorted) {
    const normName = normalizeViText(candidate.fullName);
    if (normName.length >= 2) {
      const namePattern = new RegExp(`@${escapeRegex(normName)}(?=$|[^a-z0-9])`, "i");
      if (namePattern.test(normalizedComment)) {
        matched.add(candidate.appUserId);
        continue;
      }
    }

    const emailPrefix = candidate.email?.split("@")[0]?.trim().toLowerCase() ?? "";
    if (emailPrefix.length >= 3) {
      const emailPattern = new RegExp(`@${escapeRegex(emailPrefix)}(?=$|[^a-z0-9._-])`, "i");
      if (emailPattern.test(normalizedComment)) {
        matched.add(candidate.appUserId);
      }
    }
  }

  return [...matched];
}

export type DailyDigestSlot = "morning" | "afternoon";

export interface DailyDigestWindow {
  dateKey: string;
  slot: DailyDigestSlot;
}

/**
 * Xác định khung giờ bắn thông báo kiểm tra hàng ngày theo giờ Việt Nam (UTC+7):
 * - Buổi sáng: 08:30 – 10:45 VN (nhắc mở app kiểm tra lead đầu ngày)
 * - Buổi chiều: 14:00 – 16:00 VN (nhắc xử lý lead tồn / lịch hẹn quá hạn buổi chiều)
 */
export function resolveDailyDigestWindow(now: Date): DailyDigestWindow | null {
  const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const yyyy = vnTime.getUTCFullYear();
  const mm = String(vnTime.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(vnTime.getUTCDate()).padStart(2, "0");
  const dateKey = `${yyyy}-${mm}-${dd}`;

  const minutes = vnTime.getUTCHours() * 60 + vnTime.getUTCMinutes();

  // 08:30 (510) -> 10:45 (645)
  if (minutes >= 510 && minutes <= 645) {
    return { dateKey, slot: "morning" };
  }
  // 14:00 (840) -> 16:00 (960)
  if (minutes >= 840 && minutes <= 960) {
    return { dateKey, slot: "afternoon" };
  }

  return null;
}

export function formatVnClockTime(date: Date): string {
  const vnTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const hh = String(vnTime.getUTCHours()).padStart(2, "0");
  const mm = String(vnTime.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
