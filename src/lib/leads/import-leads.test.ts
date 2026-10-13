import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { DEFAULT_LEAD_CATALOG } from "@/lib/catalog";
import type { AttrFieldRow } from "@/lib/db/attr-fields-repo";

import {
  buildLeadImportTemplateWorkbook,
  parseAndValidateImportWorkbook,
} from "./import-leads";

const SAMPLE_ATTR_FIELDS: AttrFieldRow[] = [
  {
    id: "f-budget",
    projectId: "proj-1",
    key: "ngan_sach",
    label: "Ngân sách",
    fieldType: "number",
    options: [],
    required: false,
    sortOrder: 0,
    active: true,
  },
  {
    id: "f-color",
    projectId: "proj-1",
    key: "mau_xe",
    label: "Màu xe",
    fieldType: "select",
    options: ["Trắng", "Đỏ", "Đen"],
    required: false,
    sortOrder: 1,
    active: true,
  },
  {
    id: "f-accessories",
    projectId: "proj-1",
    key: "phu_kien",
    label: "Phụ kiện quan tâm",
    fieldType: "multiselect",
    options: ["Film cách nhiệt", "Camera hành trình", "Phủ gầm"],
    required: false,
    sortOrder: 2,
    active: true,
  },
  {
    id: "f-loan",
    projectId: "proj-1",
    key: "tra_gop",
    label: "Vay trả góp",
    fieldType: "boolean",
    options: [],
    required: false,
    sortOrder: 3,
    active: true,
  },
  {
    id: "f-date",
    projectId: "proj-1",
    key: "ngay_nhan_xe",
    label: "Ngày dự kiến nhận xe",
    fieldType: "date",
    options: [],
    required: false,
    sortOrder: 4,
    active: true,
  },
];

async function makeWorkbookBuffer(
  headers: string[],
  rows: (string | number | boolean | null)[][],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Nhập lead");
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(row);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

describe("lead import template & validator", () => {
  it("builds a sample template with fixed and custom fields that validates cleanly", async () => {
    const buffer = await buildLeadImportTemplateWorkbook({
      catalog: DEFAULT_LEAD_CATALOG,
      attrFields: SAMPLE_ATTR_FIELDS,
      assignees: ["Nguyễn Thị Hoa"],
    });

    const report = await parseAndValidateImportWorkbook(buffer, {
      catalog: DEFAULT_LEAD_CATALOG,
      attrFields: SAMPLE_ATTR_FIELDS,
      assignees: ["Nguyễn Thị Hoa"],
      existingLeads: [],
      viewer: { role: "SUPER_ADMIN", appUserId: "admin-1", fullName: "Admin" },
    });

    expect(report.totalRows).toBe(1);
    expect(report.importableCount).toBe(1);
    expect(report.fullyValidCount).toBe(1);
    expect(report.blockedCount).toBe(0);

    const row = report.rows[0];
    expect(row.status).toBe("valid");
    expect(row.canImport).toBe(true);
    expect(row.payload).toMatchObject({
      name: "Nguyễn Văn Mẫu",
      phone: "0901234567",
      email: "khachhang.mau@example.com",
      attrs: {
        email: "khachhang.mau@example.com",
        ngan_sach: "500",
        mau_xe: "Trắng",
        phu_kien: "Film cách nhiệt, Camera hành trình",
        tra_gop: "true",
        ngay_nhan_xe: "2026-10-20",
      },
    });
  });

  it("blocks rows with duplicate phone or email against DB or within the same file", async () => {
    const buffer = await makeWorkbookBuffer(
      ["Họ tên *", "Số điện thoại *", "Email"],
      [
        ["Khách Trùng DB SĐT", "+84 909 111 222", "new1@example.com"],
        ["Khách Trùng DB Email", "0912333444", "EXISTING@example.com"],
        ["Khách Hợp Lệ 1", "0988777666", "valid1@example.com"],
        ["Khách Trùng SĐT Trong File", "84988777666", "valid2@example.com"],
        ["Khách Trùng Email Trong File", "0977555444", "VALID1@example.com"],
      ],
    );

    const report = await parseAndValidateImportWorkbook(buffer, {
      catalog: DEFAULT_LEAD_CATALOG,
      attrFields: [],
      assignees: [],
      existingLeads: [
        { name: "Khách Cũ A", phone: "0909111222", email: "old@example.com" },
        { name: "Khách Cũ B", phone: "0909999888", email: "existing@example.com" },
      ],
      viewer: { role: "PARTNER_ADMIN", appUserId: "p-1" },
    });

    expect(report.totalRows).toBe(5);
    expect(report.importableCount).toBe(1);
    expect(report.blockedCount).toBe(4);
    expect(report.duplicateCount).toBe(4);

    expect(report.rows[0].canImport).toBe(false);
    expect(report.rows[0].blockingError).toMatch(/Trùng SĐT với lead «Khách Cũ A»/);

    expect(report.rows[1].canImport).toBe(false);
    expect(report.rows[1].blockingError).toMatch(/Trùng email với lead «Khách Cũ B»/);

    expect(report.rows[2].canImport).toBe(true);
    expect(report.rows[2].status).toBe("valid");

    expect(report.rows[3].canImport).toBe(false);
    expect(report.rows[3].blockingError).toMatch(/Trùng SĐT với dòng 4/);

    expect(report.rows[4].canImport).toBe(false);
    expect(report.rows[4].blockingError).toMatch(/Trùng email với dòng 4/);
  });

  it("reports valid and invalid fields per row and still allows importing valid fields when phone/email are unique", async () => {
    const buffer = await makeWorkbookBuffer(
      ["Họ tên *", "Số điện thoại *", "Thương hiệu", "Ngân sách", "Màu xe", "Ngày dự kiến nhận xe"],
      [
        ["Trần Văn B", "0933444555", "KIA", "không phải số", "Xanh lá", "25/10/2026"],
      ],
    );

    const report = await parseAndValidateImportWorkbook(buffer, {
      catalog: DEFAULT_LEAD_CATALOG,
      attrFields: SAMPLE_ATTR_FIELDS,
      assignees: [],
      existingLeads: [],
      viewer: { role: "SUPER_ADMIN", appUserId: "admin-1" },
    });

    expect(report.totalRows).toBe(1);
    expect(report.importableCount).toBe(1);
    expect(report.partialValidCount).toBe(1);

    const row = report.rows[0];
    expect(row.status).toBe("partial");
    expect(row.canImport).toBe(true);
    expect(row.validFields.map((f) => f.field)).toEqual([
      "Họ tên",
      "Số điện thoại",
      DEFAULT_LEAD_CATALOG.labels.brand,
      "Ngày dự kiến nhận xe",
    ]);
    expect(row.invalidFields.map((f) => f.field)).toEqual(["Ngân sách", "Màu xe"]);
    expect(row.payload).toMatchObject({
      name: "Trần Văn B",
      phone: "0933444555",
      brand: "KIA",
      assignee: null,
      attrs: {
        ngay_nhan_xe: "2026-10-25",
      },
    });
  });

  it("auto-assigns STAFF to their own account and defaults ADMIN to unassigned", async () => {
    const buffer = await makeWorkbookBuffer(
      ["Họ tên *", "Số điện thoại *", "Phụ trách"],
      [["Lê Thị C", "0944555666", ""]],
    );

    const staffReport = await parseAndValidateImportWorkbook(buffer, {
      catalog: DEFAULT_LEAD_CATALOG,
      attrFields: [],
      assignees: ["Nhân Viên A"],
      existingLeads: [],
      viewer: { role: "STAFF", appUserId: "staff-1", fullName: "Nhân Viên Tự Tạo" },
    });
    expect(staffReport.rows[0].payload?.assignee).toBe("Nhân Viên Tự Tạo");

    const adminReport = await parseAndValidateImportWorkbook(buffer, {
      catalog: DEFAULT_LEAD_CATALOG,
      attrFields: [],
      assignees: ["Nhân Viên A"],
      existingLeads: [],
      viewer: { role: "SUPER_ADMIN", appUserId: "admin-1", fullName: "Super Admin" },
    });
    expect(adminReport.rows[0].payload?.assignee).toBeNull();
  });
});
