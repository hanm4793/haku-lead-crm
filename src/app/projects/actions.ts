"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canManageCatalogsInProject, canManageProjects } from "@/lib/auth/roles";
import { getViewer } from "@/lib/auth/viewer";
import {
  addFacebookPage,
  listFacebookPages,
  setFacebookPageActive,
  updateFacebookPageName,
} from "@/lib/db/facebook-pages-repo";
import { listAccessiblePages } from "@/lib/facebook/page-tokens";
import {
  assignFacebookPageToProject,
  assignPartnerAndStaffToProject,
  assertCanAccessProject,
  listProjectIdsForViewer,
  removeProjectMember,
  toProjectViewer,
} from "@/lib/db/project-repo";
import {
  ACTIVE_PROJECT_COOKIE,
  createProject,
  listAdAccounts,
  listProjects,
  removeAdAccount,
  setAdAccountActive,
  updateProject,
  upsertAdAccount,
  type AdPlatform,
  type ProjectAdAccountRow,
  type ProjectRow,
} from "@/lib/db/project-repo";

export type ProjectActionResult = { ok: true } | { ok: false; error: string };

async function requireProjectAdmin(): Promise<{ error: string } | { viewer: NonNullable<Awaited<ReturnType<typeof getViewer>>> }> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Phiên đăng nhập đã hết hạn." };
  if (!canManageProjects(viewer.role)) return { error: "Chỉ super admin quản lý project." };
  return { viewer };
}

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/reports");
  revalidatePath("/marketing");
  revalidatePath("/settings");
  revalidatePath("/users");
  revalidatePath("/projects");
}

async function requireViewer(): Promise<
  { error: string } | { viewer: NonNullable<Awaited<ReturnType<typeof getViewer>>> }
> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Phiên đăng nhập đã hết hạn." };
  return { viewer };
}

export async function setActiveProjectAction(projectId: string): Promise<ProjectActionResult> {
  const gate = await requireViewer();
  if ("error" in gate) return { ok: false, error: gate.error };

  const parsed = z.string().uuid().safeParse(projectId);
  if (!parsed.success) return { ok: false, error: "Project không hợp lệ." };

  const allowed = await listProjectIdsForViewer(toProjectViewer(gate.viewer));
  if (gate.viewer.role !== "SUPER_ADMIN" && !allowed.includes(parsed.data)) {
    return { ok: false, error: "Bạn không có quyền chọn project này." };
  }

  const jar = await cookies();
  jar.set(ACTIVE_PROJECT_COOKIE, parsed.data, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidateAll();
  return { ok: true };
}

const createProjectSchema = z.object({
  slug: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  brandLabel: z.string().trim().max(40).optional(),
  productLabel: z.string().trim().max(40).optional(),
  locationLabel: z.string().trim().max(40).optional(),
});

export async function createProjectAction(input: unknown): Promise<
  { ok: true; project: ProjectRow } | { ok: false; error: string }
> {
  const gate = await requireProjectAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu project không hợp lệ." };
  try {
    const project = await createProject(parsed.data);
    revalidatePath("/projects");
    return { ok: true, project };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Tạo project thất bại." };
  }
}

export async function updateProjectAction(input: {
  id: string;
  name?: string;
  brandLabel?: string;
  productLabel?: string;
  locationLabel?: string;
  active?: boolean;
}): Promise<{ ok: true; project: ProjectRow } | { ok: false; error: string }> {
  const gate = await requireViewer();
  if ("error" in gate) return { ok: false, error: gate.error };
  const id = z.string().uuid().safeParse(input.id);
  if (!id.success) return { ok: false, error: "Project không hợp lệ." };

  const isSuper = canManageProjects(gate.viewer.role);
  const canLabels = canManageCatalogsInProject(gate.viewer, id.data);
  if (!isSuper && !canLabels) {
    return { ok: false, error: "Bạn không có quyền sửa project này." };
  }
  try {
    await assertCanAccessProject(toProjectViewer(gate.viewer), id.data);
    const patch = isSuper
      ? {
          name: input.name,
          brandLabel: input.brandLabel,
          productLabel: input.productLabel,
          locationLabel: input.locationLabel,
          active: input.active,
        }
      : {
          brandLabel: input.brandLabel,
          productLabel: input.productLabel,
          locationLabel: input.locationLabel,
        };
    const project = await updateProject(id.data, patch);
    revalidateAll();
    revalidatePath(`/projects/${id.data}`);
    return { ok: true, project };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Cập nhật thất bại." };
  }
}

export async function assignPageToProjectAction(input: {
  pageId: string;
  projectId: string | null;
}): Promise<ProjectActionResult> {
  const gate = await requireProjectAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  try {
    await assignFacebookPageToProject(input.pageId, input.projectId);
    revalidateAll();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Gán fanpage thất bại." };
  }
}

export type AccessiblePageOption = {
  facebookPageId: string;
  name: string | null;
  /** available: chọn được · in_project: đã có ở dự án này · other_project: đang thuộc dự án khác. */
  state: "available" | "in_project" | "other_project";
  otherProjectName?: string;
};

/**
 * Fanpage mà tài khoản Facebook của token đang có quyền. Quyền với fanpage cấp ở Meta,
 * app chỉ cho chọn trong danh sách này thay vì nhập Page ID tự do.
 */
export async function listAccessiblePagesAction(
  projectId: string,
): Promise<{ ok: true; pages: AccessiblePageOption[] } | { ok: false; error: string }> {
  const gate = await requireProjectAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  if (!z.string().uuid().safeParse(projectId).success) return { ok: false, error: "Project không hợp lệ." };
  try {
    const [accessible, known, allProjects] = await Promise.all([
      listAccessiblePages(),
      listFacebookPages(),
      listProjects(),
    ]);
    const byPageId = new Map(known.map((p) => [p.facebookPageId, p]));
    const projectName = new Map(allProjects.map((p) => [p.id, p.name]));
    const pages = accessible.map<AccessiblePageOption>((page) => {
      const owner = byPageId.get(page.id)?.projectId ?? null;
      const state = !owner ? "available" : owner === projectId ? "in_project" : "other_project";
      return {
        facebookPageId: page.id,
        name: page.name,
        state,
        otherProjectName: state === "other_project" && owner ? projectName.get(owner) : undefined,
      };
    });
    return { ok: true, pages };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Không lấy được danh sách fanpage từ Facebook.",
    };
  }
}

/** Thêm các fanpage đã chọn vào dự án. Chỉ nhận page nằm trong danh sách token có quyền. */
export async function addPagesToProjectAction(input: {
  projectId: string;
  facebookPageIds: string[];
}): Promise<ProjectActionResult> {
  const gate = await requireProjectAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const projectId = z.string().uuid().safeParse(input.projectId);
  if (!projectId.success) return { ok: false, error: "Project không hợp lệ." };
  const wanted = [...new Set(input.facebookPageIds.map((id) => id.trim()).filter(Boolean))];
  if (wanted.length === 0) return { ok: false, error: "Chưa chọn fanpage nào." };
  try {
    const accessible = new Map((await listAccessiblePages()).map((p) => [p.id, p]));
    const known = new Map((await listFacebookPages()).map((p) => [p.facebookPageId, p]));
    for (const id of wanted) {
      if (!accessible.has(id)) {
        return { ok: false, error: `Tài khoản Facebook chưa có quyền với fanpage ${id}.` };
      }
      const owner = known.get(id)?.projectId;
      if (owner && owner !== projectId.data) {
        return { ok: false, error: `Fanpage ${accessible.get(id)?.name ?? id} đang thuộc dự án khác. Gỡ khỏi dự án đó trước.` };
      }
    }
    for (const id of wanted) {
      await addFacebookPage(id, accessible.get(id)?.name ?? null, projectId.data);
    }
    revalidateAll();
    revalidatePath(`/projects/${projectId.data}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Thêm fanpage thất bại." };
  }
}

/** Kiểm tra lại các fanpage của dự án với Facebook: cập nhật tên, báo page token không còn quyền. */
export async function checkProjectPagesAction(
  projectId: string,
): Promise<{ ok: true; checked: number; missing: string[] } | { ok: false; error: string }> {
  const gate = await requireProjectAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  if (!z.string().uuid().safeParse(projectId).success) return { ok: false, error: "Project không hợp lệ." };
  try {
    const accessible = new Map((await listAccessiblePages()).map((p) => [p.id, p]));
    const mine = await listFacebookPages({ projectId });
    const missing: string[] = [];
    for (const page of mine) {
      const found = accessible.get(page.facebookPageId);
      if (!found) {
        missing.push(page.name?.trim() || page.facebookPageId);
        continue;
      }
      if (found.name && found.name !== page.name) await updateFacebookPageName(page.facebookPageId, found.name);
    }
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, checked: mine.length, missing };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Kiểm tra fanpage thất bại." };
  }
}

export async function setProjectPageActiveAction(input: {
  id: string;
  active: boolean;
}): Promise<ProjectActionResult> {
  const gate = await requireProjectAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  try {
    await setFacebookPageActive(input.id, input.active);
    revalidateAll();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Cập nhật fanpage thất bại." };
  }
}

export async function assignPartnerToProjectAction(input: {
  partnerId: string;
  projectId: string;
}): Promise<ProjectActionResult> {
  const gate = await requireProjectAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  try {
    await assignPartnerAndStaffToProject(input.partnerId, input.projectId);
    revalidatePath("/users");
    revalidateAll();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Gán partner thất bại." };
  }
}

export async function removePartnerFromProjectAction(input: {
  partnerId: string;
  projectId: string;
}): Promise<ProjectActionResult> {
  const gate = await requireProjectAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  try {
    await removeProjectMember(input.projectId, input.partnerId);
    revalidatePath("/users");
    revalidateAll();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Bỏ gán thất bại." };
  }
}

const adPlatformSchema = z.enum(["google", "tiktok", "zalo"]);

export async function upsertAdAccountAction(input: {
  projectId: string;
  platform: AdPlatform;
  externalAccountId: string;
  name?: string | null;
}): Promise<{ ok: true; account: ProjectAdAccountRow } | { ok: false; error: string }> {
  const gate = await requireProjectAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const platform = adPlatformSchema.safeParse(input.platform);
  if (!platform.success) return { ok: false, error: "Nền tảng không hợp lệ." };
  try {
    const account = await upsertAdAccount({
      projectId: input.projectId,
      platform: platform.data,
      externalAccountId: input.externalAccountId,
      name: input.name,
    });
    revalidatePath("/projects");
    return { ok: true, account };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Lưu tài khoản ads thất bại." };
  }
}

export async function setAdAccountActiveAction(input: {
  id: string;
  active: boolean;
}): Promise<ProjectActionResult> {
  const gate = await requireProjectAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  try {
    await setAdAccountActive(input.id, input.active);
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Cập nhật thất bại." };
  }
}

export async function removeAdAccountAction(id: string): Promise<ProjectActionResult> {
  const gate = await requireProjectAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  try {
    await removeAdAccount(id);
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Xóa thất bại." };
  }
}

export async function loadProjectsAdminData() {
  const gate = await requireProjectAdmin();
  if ("error" in gate) return { ok: false as const, error: gate.error };
  const projects = await listProjects();
  return { ok: true as const, projects };
}

export async function loadProjectAdAccounts(projectId: string) {
  const gate = await requireProjectAdmin();
  if ("error" in gate) return { ok: false as const, error: gate.error };
  const accounts = await listAdAccounts(projectId);
  return { ok: true as const, accounts };
}
