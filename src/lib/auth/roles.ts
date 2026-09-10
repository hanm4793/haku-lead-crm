export const USER_ROLES = ["ADMIN", "SHOWROOM_MANAGER", "SALES"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Quản trị",
  SHOWROOM_MANAGER: "Quản lý showroom",
  SALES: "Nhân viên KD",
};

export const ROLE_HINTS: Record<UserRole, string> = {
  ADMIN: "Xem và sửa toàn bộ lead",
  SHOWROOM_MANAGER: "Chỉ lead thuộc showroom được gán",
  SALES: "Chỉ lead được phân công cho mình",
};
