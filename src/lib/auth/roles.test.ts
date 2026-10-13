import { describe, expect, it } from "vitest";

import { scopeConditions } from "@/lib/db/leads-repo";

import {
  assertCanManageAccount,
  canAssignLead,
  canCommentLead,
  canCreateLead,
  canEditLead,
  canEditLeadProfile,
  canEmailAccount,
  canImportLeads,
  canManageAttrFields,
  canManageAttrFieldsInProject,
  canManageCatalogs,
  canManageCatalogsInProject,
  canManageProjects,
  canManageSettings,
  canManageUsers,
  canSeeNav,
  canViewProjects,
  canUseAi,
  canViewMarketing,
  canViewReports,
  dataScope,
  guardAccountUpdate,
  isPageVisible,
  isPageInProjectScope,
  isMarketingRowVisible,
  pageGrantUserId,
  prepareCreateAccount,
  rejectNewSuperAdmin,
  resolveManualLeadAssignee,
  type UserRole,
} from "./roles";

const ROLES: UserRole[] = ["SUPER_ADMIN", "PARTNER_ADMIN", "STAFF"];

describe("menu", () => {
  it("lead is visible to every role", () => {
    for (const role of ROLES) expect(canSeeNav(role, "all")).toBe(true);
  });

  it("reports is manager screen and marketing is super-admin-only", () => {
    expect(canSeeNav("SUPER_ADMIN", "reports")).toBe(true);
    expect(canSeeNav("PARTNER_ADMIN", "reports")).toBe(true);
    expect(canSeeNav("STAFF", "reports")).toBe(false);
    expect(canViewReports("STAFF")).toBe(false);

    expect(canSeeNav("SUPER_ADMIN", "marketing")).toBe(true);
    expect(canSeeNav("PARTNER_ADMIN", "marketing")).toBe(false);
    expect(canSeeNav("STAFF", "marketing")).toBe(false);
    expect(canViewMarketing("SUPER_ADMIN")).toBe(true);
    expect(canViewMarketing("PARTNER_ADMIN")).toBe(false);
    expect(canViewMarketing("STAFF")).toBe(false);
  });

  it("accounts is manager-only and settings is super-admin-only", () => {
    expect(canSeeNav("SUPER_ADMIN", "users")).toBe(true);
    expect(canSeeNav("PARTNER_ADMIN", "users")).toBe(true);
    expect(canSeeNav("STAFF", "users")).toBe(false);
    expect(canManageUsers("STAFF")).toBe(false);

    expect(canSeeNav("SUPER_ADMIN", "settings")).toBe(true);
    expect(canSeeNav("PARTNER_ADMIN", "settings")).toBe(false);
    expect(canSeeNav("STAFF", "settings")).toBe(false);
    expect(canManageSettings("PARTNER_ADMIN")).toBe(false);
    expect(canManageSettings("STAFF")).toBe(false);
  });

  it("settings catalog CRUD remains super-admin-only", () => {
    expect(canManageCatalogs("SUPER_ADMIN")).toBe(true);
    expect(canManageCatalogs("PARTNER_ADMIN")).toBe(false);
    expect(canManageCatalogs("STAFF")).toBe(false);
  });

  it("partner manages catalog on member projects only", () => {
    const partner = { role: "PARTNER_ADMIN" as const, projectIds: ["proj-a"] };
    expect(canManageCatalogsInProject(partner, "proj-a")).toBe(true);
    expect(canManageCatalogsInProject(partner, "proj-b")).toBe(false);
    expect(canManageAttrFieldsInProject(partner, "proj-a")).toBe(true);
    expect(canManageAttrFields("PARTNER_ADMIN")).toBe(false);
  });

  it("projects menu and create gate", () => {
    expect(canSeeNav("SUPER_ADMIN", "projects")).toBe(true);
    expect(canSeeNav("PARTNER_ADMIN", "projects")).toBe(true);
    expect(canSeeNav("STAFF", "projects")).toBe(false);
    expect(canViewProjects("STAFF")).toBe(false);
    expect(canManageProjects("SUPER_ADMIN")).toBe(true);
    expect(canManageProjects("PARTNER_ADMIN")).toBe(false);
  });
});

describe("lead data", () => {
  it("super admin sees every page even with an empty grant list", () => {
    expect(dataScope({ role: "SUPER_ADMIN", pageIds: [] })).toBe("all");
    expect(dataScope({ role: "SUPER_ADMIN", pageIds: ["p1"] })).toBe("all");
    expect(isPageVisible({ role: "SUPER_ADMIN", pageIds: [] }, null)).toBe(true);
    expect(scopeConditions({ role: "SUPER_ADMIN", pageIds: ["p1"] })).toEqual([]);
    expect(scopeConditions({ role: "SUPER_ADMIN", pageIds: [], activeProjectId: "proj-1" })).toHaveLength(1);
  });

  it("partner admin and staff see only granted pages", () => {
    for (const role of ["PARTNER_ADMIN", "STAFF"] as const) {
      expect(dataScope({ role, pageIds: ["p1"] })).toBe("granted-pages");
      expect(isPageVisible({ role, pageIds: ["p1"] }, "p1")).toBe(true);
      expect(isPageVisible({ role, pageIds: ["p1"] }, "other")).toBe(false);
      expect(isPageVisible({ role, pageIds: ["p1"] }, null)).toBe(false);
      expect(scopeConditions({ role, pageIds: ["p1"] })).toHaveLength(1);
    }
  });

  it("an empty grant list hides every lead", () => {
    for (const role of ["PARTNER_ADMIN", "STAFF"] as const) {
      expect(dataScope({ role, pageIds: [] })).toBe("none");
      expect(isPageVisible({ role, pageIds: [] }, "p1")).toBe(false);
      expect(scopeConditions({ role, pageIds: [] })).toHaveLength(1);
    }
  });

  it("marketing rows respect grant and active project page list", () => {
    expect(isPageInProjectScope("p1", null)).toBe(true);
    expect(isPageInProjectScope(null, null)).toBe(true);
    expect(isPageInProjectScope("p1", ["p1", "p2"])).toBe(true);
    expect(isPageInProjectScope("other", ["p1"])).toBe(false);
    expect(isPageInProjectScope(null, ["p1"])).toBe(false);

    const superAdmin = { role: "SUPER_ADMIN" as const, pageIds: [] as string[] };
    expect(isMarketingRowVisible(superAdmin, "p1", null)).toBe(true);
    expect(isMarketingRowVisible(superAdmin, null, null)).toBe(true);
    expect(isMarketingRowVisible(superAdmin, "p1", ["p1"])).toBe(true);
    expect(isMarketingRowVisible(superAdmin, "other", ["p1"])).toBe(false);
    expect(isMarketingRowVisible(superAdmin, null, ["p1"])).toBe(false);

    const partner = { role: "PARTNER_ADMIN" as const, pageIds: ["p1"] };
    expect(isMarketingRowVisible(partner, "p1", ["p1", "p2"])).toBe(false);
    expect(isMarketingRowVisible(partner, "p2", ["p1", "p2"])).toBe(false);
    expect(isMarketingRowVisible({ role: "STAFF" as const, pageIds: ["p1"] }, "p1", ["p1"])).toBe(false);
  });

  it("staff inherit the partner grant and partners hold their own", () => {
    expect(pageGrantUserId({ role: "SUPER_ADMIN", id: "super", partnerId: null })).toBeNull();
    expect(pageGrantUserId({ role: "PARTNER_ADMIN", id: "partner", partnerId: null })).toBe("partner");
    expect(pageGrantUserId({ role: "STAFF", id: "staff", partnerId: "partner" })).toBe("partner");
    expect(pageGrantUserId({ role: "STAFF", id: "staff", partnerId: null })).toBeNull();
  });

  it("staff edit only leads assigned to themselves", () => {
    const staff = { role: "STAFF" as const, appUserId: "staff-1" };
    expect(canEditLead(staff, { assigneeId: "staff-1" })).toBe(true);
    expect(canEditLead(staff, { assigneeId: "other" })).toBe(false);
    expect(canEditLead(staff, { assigneeId: null })).toBe(false);
    expect(canEditLead({ role: "STAFF", appUserId: null }, { assigneeId: "staff-1" })).toBe(false);

    expect(canEditLead({ role: "PARTNER_ADMIN", appUserId: "partner" }, { assigneeId: null })).toBe(true);
    expect(canEditLead({ role: "SUPER_ADMIN", appUserId: "super" }, { assigneeId: "anyone" })).toBe(true);
  });

  it("only super admin and partner admin can assign leads", () => {
    expect(canAssignLead("SUPER_ADMIN")).toBe(true);
    expect(canAssignLead("PARTNER_ADMIN")).toBe(true);
    expect(canAssignLead("STAFF")).toBe(false);
    expect(canAssignLead({ role: "SUPER_ADMIN" })).toBe(true);
    expect(canAssignLead({ role: "PARTNER_ADMIN" })).toBe(true);
    expect(canAssignLead({ role: "STAFF" })).toBe(false);
  });

  it("only MANUAL leads allow editing name and phone, respecting lead edit boundary", () => {
    const staff = { role: "STAFF" as const, appUserId: "staff-1" };
    const partner = { role: "PARTNER_ADMIN" as const, appUserId: "partner-1" };
    const superAdmin = { role: "SUPER_ADMIN" as const, appUserId: "super-1" };

    expect(canEditLeadProfile(superAdmin, { assigneeId: null, source: "MANUAL" })).toBe(true);
    expect(canEditLeadProfile(partner, { assigneeId: null, source: "MANUAL" })).toBe(true);
    expect(canEditLeadProfile(staff, { assigneeId: "staff-1", source: "MANUAL" })).toBe(true);
    expect(canEditLeadProfile(staff, { assigneeId: "other", source: "MANUAL" })).toBe(false);

    // Non-manual sources (e.g., FACEBOOK, GOOGLE, HOTLINE) cannot edit name/phone even for super admin
    expect(canEditLeadProfile(superAdmin, { assigneeId: "staff-1", source: "FACEBOOK" })).toBe(false);
    expect(canEditLeadProfile(partner, { assigneeId: null, source: "FACEBOOK" })).toBe(false);
    expect(canEditLeadProfile(staff, { assigneeId: "staff-1", source: "FACEBOOK" })).toBe(false);
  });

  it("all roles can create/import manual leads; staff auto-assigns to self while admin defaults to unassigned", () => {
    for (const role of ROLES) {
      expect(canCreateLead(role)).toBe(true);
      expect(canImportLeads(role)).toBe(true);
    }

    expect(resolveManualLeadAssignee({ role: "STAFF", appUserId: "staff-1" }, null)).toBe("staff-1");
    expect(resolveManualLeadAssignee({ role: "STAFF", appUserId: "staff-1" }, "someone-else")).toBe("staff-1");
    expect(resolveManualLeadAssignee({ role: "SUPER_ADMIN", appUserId: "super-1" }, null)).toBeNull();
    expect(resolveManualLeadAssignee({ role: "PARTNER_ADMIN", appUserId: "partner-1" }, undefined)).toBeNull();
    expect(resolveManualLeadAssignee({ role: "SUPER_ADMIN", appUserId: "super-1" }, "staff-2")).toBe("staff-2");
  });

  it("staff comment only on leads assigned to themselves, managers on all in view", () => {
    const staff = { role: "STAFF" as const, appUserId: "staff-1" };
    expect(canCommentLead(staff, { assigneeId: "staff-1" })).toBe(true);
    expect(canCommentLead(staff, { assigneeId: "other" })).toBe(false);
    expect(canCommentLead(staff, { assigneeId: null })).toBe(false);
    expect(canCommentLead({ role: "STAFF", appUserId: null }, { assigneeId: "staff-1" })).toBe(false);

    expect(canCommentLead({ role: "PARTNER_ADMIN", appUserId: "partner" }, { assigneeId: null })).toBe(true);
    expect(canCommentLead({ role: "SUPER_ADMIN", appUserId: "super" }, { assigneeId: "anyone" })).toBe(true);
  });
});

describe("accounts", () => {
  const partner = { role: "PARTNER_ADMIN" as const, appUserId: "partner-1" };
  const ownStaff = { role: "STAFF" as const, partnerId: "partner-1" };
  const otherStaff = { role: "STAFF" as const, partnerId: "partner-2" };

  it("super admin can manage any account but cannot mint another super admin here", () => {
    expect(() =>
      assertCanManageAccount({ role: "SUPER_ADMIN", appUserId: "super" }, { role: "PARTNER_ADMIN", partnerId: null }),
    ).not.toThrow();
    expect(() => rejectNewSuperAdmin("STAFF", "SUPER_ADMIN")).toThrow(/super admin/);
    expect(() => rejectNewSuperAdmin("SUPER_ADMIN", "SUPER_ADMIN")).not.toThrow();
  });

  it("partner admin manages only their own staff", () => {
    expect(() => assertCanManageAccount(partner, ownStaff)).not.toThrow();
    expect(() => assertCanManageAccount(partner, otherStaff)).toThrow(/nhân viên của bạn/);
    expect(() =>
      assertCanManageAccount(partner, { role: "PARTNER_ADMIN", partnerId: null }),
    ).toThrow(/nhân viên của bạn/);
    expect(() => assertCanManageAccount({ role: "STAFF", appUserId: "staff" }, ownStaff)).toThrow(
      /không có quyền/,
    );
  });

  it("creating an account locks role, partner, AI flag, and page grants", () => {
    expect(
      prepareCreateAccount(
        { role: "SUPER_ADMIN" },
        { role: "PARTNER_ADMIN", projectId: "proj-1", aiEnabled: true, pageIds: ["p1", "p1"] },
      ),
    ).toEqual({
      role: "PARTNER_ADMIN",
      partnerId: null,
      projectId: "proj-1",
      aiEnabled: true,
      pageIds: ["p1", "p1"],
    });

    expect(
      prepareCreateAccount({ role: "SUPER_ADMIN" }, { role: "STAFF", partnerId: "partner-1", pageIds: ["p1"] }),
    ).toEqual({
      role: "STAFF",
      partnerId: "partner-1",
      projectId: null,
      aiEnabled: false,
      pageIds: [],
    });

    expect(prepareCreateAccount(partner, { role: "STAFF", aiEnabled: true, pageIds: ["p1"] })).toEqual({
      role: "STAFF",
      partnerId: "partner-1",
      projectId: null,
      aiEnabled: false,
      pageIds: [],
    });

    expect(() => prepareCreateAccount(partner, { role: "PARTNER_ADMIN" })).toThrow(/chỉ tạo được nhân viên/);
    expect(() => prepareCreateAccount({ role: "SUPER_ADMIN" }, { role: "SUPER_ADMIN" })).toThrow(/super admin/);
    expect(() => prepareCreateAccount({ role: "SUPER_ADMIN" }, { role: "STAFF" })).toThrow(/partner admin/);
    expect(() =>
      prepareCreateAccount({ role: "SUPER_ADMIN" }, { role: "PARTNER_ADMIN", pageIds: [] }),
    ).toThrow(/project/);
    expect(() => prepareCreateAccount({ role: "STAFF", appUserId: "staff" }, { role: "STAFF" })).toThrow(
      /không có quyền/,
    );
  });

  it("password email follows the same account boundary", () => {
    expect(canEmailAccount({ role: "SUPER_ADMIN" }, { role: "PARTNER_ADMIN", partnerId: null })).toBe(true);
    expect(canEmailAccount(partner, ownStaff)).toBe(true);
    expect(canEmailAccount(partner, otherStaff)).toBe(false);
    expect(canEmailAccount({ role: "STAFF", appUserId: "staff" }, ownStaff)).toBe(false);
  });

  it("blocks self-demotion and the last active super admin", () => {
    expect(() =>
      guardAccountUpdate({
        isSelf: true,
        wasSuperAdmin: true,
        wasActive: true,
        nextRole: "SUPER_ADMIN",
        nextActive: false,
        otherActiveSuperAdmins: 2,
      }),
    ).toThrow(/vô hiệu hóa/);

    expect(() =>
      guardAccountUpdate({
        isSelf: true,
        wasSuperAdmin: true,
        wasActive: true,
        nextRole: "PARTNER_ADMIN",
        nextActive: true,
        otherActiveSuperAdmins: 2,
      }),
    ).toThrow(/hạ quyền/);

    expect(() =>
      guardAccountUpdate({
        isSelf: false,
        wasSuperAdmin: true,
        wasActive: true,
        nextRole: "STAFF",
        nextActive: true,
        otherActiveSuperAdmins: 0,
      }),
    ).toThrow(/ít nhất một super admin/);

    expect(() =>
      guardAccountUpdate({
        isSelf: false,
        wasSuperAdmin: true,
        wasActive: true,
        nextRole: "STAFF",
        nextActive: true,
        otherActiveSuperAdmins: 1,
      }),
    ).not.toThrow();
  });
});

describe("AI", () => {
  it("is always on for super admin, flagged for partner admin, and off for staff (/api/ai/chat, /api/ai/mentions, /api/ai/lead-copilot)", () => {
    expect(canUseAi({ role: "SUPER_ADMIN", aiEnabled: false })).toBe(true);
    expect(canUseAi({ role: "PARTNER_ADMIN", aiEnabled: true })).toBe(true);
    expect(canUseAi({ role: "PARTNER_ADMIN", aiEnabled: false })).toBe(false);
    expect(canUseAi({ role: "PARTNER_ADMIN" })).toBe(false);
    expect(canUseAi({ role: "STAFF", aiEnabled: true })).toBe(false);
  });

  it("restricts AI marketing metrics and @campaign/@ad mentions to super admin via canViewMarketing", () => {
    expect(canViewMarketing("SUPER_ADMIN")).toBe(true);
    expect(canViewMarketing("PARTNER_ADMIN")).toBe(false);
    expect(canViewMarketing("STAFF")).toBe(false);
  });
});

