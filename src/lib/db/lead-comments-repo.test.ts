import { describe, expect, it } from "vitest";

import { buildCommentThreads, type RawCommentRow } from "./lead-comments-repo";

describe("buildCommentThreads", () => {
  it("returns empty array when there are no comments", () => {
    expect(buildCommentThreads([])).toEqual([]);
  });

  it("handles flat root comments", () => {
    const now = new Date();
    const rows: RawCommentRow[] = [
      {
        id: "c1",
        leadId: "lead-1",
        userId: "user-1",
        userName: "Nguyễn Văn A",
        userRole: "SUPER_ADMIN",
        content: "Khách cần báo giá",
        parentId: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "c2",
        leadId: "lead-1",
        userId: "user-2",
        userName: "Trần Thị B",
        userRole: "STAFF",
        content: "Đã gửi báo giá qua Zalo",
        parentId: null,
        createdAt: now,
        updatedAt: now,
      },
    ];

    const result = buildCommentThreads(rows);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("c1");
    expect(result[0].replies).toEqual([]);
    expect(result[1].id).toBe("c2");
    expect(result[1].replies).toEqual([]);
  });

  it("nests replies 1 level under their parent root comment", () => {
    const t1 = new Date("2026-10-13T07:00:00Z");
    const t2 = new Date("2026-10-13T07:05:00Z");
    const t3 = new Date("2026-10-13T07:10:00Z");

    const rows: RawCommentRow[] = [
      {
        id: "root-1",
        leadId: "lead-1",
        userId: "u1",
        userName: "Admin",
        userRole: "SUPER_ADMIN",
        content: "Gọi lại vào chiều nay nhé",
        parentId: null,
        createdAt: t1,
        updatedAt: t1,
      },
      {
        id: "reply-1",
        leadId: "lead-1",
        userId: "u2",
        userName: "Staff",
        userRole: "STAFF",
        content: "Vâng em đã note lịch 15h",
        parentId: "root-1",
        createdAt: t2,
        updatedAt: t2,
      },
      {
        id: "reply-2",
        leadId: "lead-1",
        userId: "u1",
        userName: "Admin",
        userRole: "SUPER_ADMIN",
        content: "Nhớ cập nhật kết quả",
        parentId: "root-1",
        createdAt: t3,
        updatedAt: t3,
      },
    ];

    const result = buildCommentThreads(rows);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("root-1");
    expect(result[0].replies).toHaveLength(2);
    expect(result[0].replies![0].id).toBe("reply-1");
    expect(result[0].replies![1].id).toBe("reply-2");
  });

  it("orphaned comments whose parent does not exist are elevated to root", () => {
    const now = new Date();
    const rows: RawCommentRow[] = [
      {
        id: "c-orphan",
        leadId: "lead-1",
        userId: "u1",
        userName: "Staff",
        userRole: "STAFF",
        content: "Bình luận mồ côi",
        parentId: "non-existent-parent",
        createdAt: now,
        updatedAt: now,
      },
    ];

    const result = buildCommentThreads(rows);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c-orphan");
  });
});
