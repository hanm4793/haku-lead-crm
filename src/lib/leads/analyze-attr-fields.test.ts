import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  analyzeExcelForAttrFields,
  formatPrettyLabel,
  slugifyAttrKey,
} from "./analyze-attr-fields";

describe("analyzeExcelForAttrFields", () => {
  it("formats uppercase Vietnamese headers cleanly while preserving acronyms", () => {
    expect(formatPrettyLabel("MÃ ĐẠI LÝ")).toBe("Mã đại lý");
    expect(formatPrettyLabel("SỐ CCCD")).toBe("Số CCCD");
    expect(formatPrettyLabel("MÃ SỐ THUẾ (CÔNG TY)")).toBe("Mã số thuế (Công ty)");
    expect(slugifyAttrKey("MÃ SỐ THUẾ (CÔNG TY)")).toBe("ma_so_thue");
  });

  it("detects multi-row headers, classifies core/existing/suggested columns, and infers field types accurately", async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Sheet0");

    // Row 1: Group headers
    sheet.addRow([
      "STT",
      "Thông tin đại lý",
      "Thông tin khách hàng",
      "Thông tin khách hàng",
      "Thông tin khách hàng",
      "Thông tin khách hàng",
      "Thông tin hợp đồng",
      "Thông tin xe",
      "Thông tin thanh toán",
    ]);

    // Row 2: Column headers
    sheet.addRow([
      "STT",
      "TÊN ĐẠI LÝ",
      "TÊN KHÁCH HÀNG",
      "SDT",
      "LOẠI KHÁCH HÀNG",
      "SỐ CCCD",
      "NGÀY KÝ HỢP ĐỒNG MUA BÁN",
      "LOẠI XE",
      "GIÁ XE",
    ]);

    // Sample rows
    sheet.addRow([1, "SR Phạm Văn Đồng", "Nguyễn Văn A", "0901234567", "Cá nhân", "001095012345", "2026-08-31", "08", 1299000000]);
    sheet.addRow([2, "SR Long Biên", "Công ty B", "0901234568", "Tổ chức", "001095012346", "2026-09-01", "06", 729000000]);
    sheet.addRow([3, "SR Phạm Văn Đồng", "Trần Thị C", "0901234569", "Cá nhân", "001095012347", "2026-09-05", "01", 999000000]);
    sheet.addRow([4, "SR Long Biên", "Lê Văn D", "0901234570", "Cá nhân", "001095012348", "2026-09-10", "09", 2199000000]);

    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const report = await analyzeExcelForAttrFields(buf, {
      enableAi: false,
      existingFields: [
        {
          id: "existing-1",
          projectId: "proj-1",
          key: "so_cccd",
          label: "Số CCCD",
          fieldType: "text",
          options: [],
          required: false,
          sortOrder: 1,
          active: true,
        },
      ],
    });

    expect(report.headerRowIndex).toBe(2);
    expect(report.totalRowsScanned).toBe(4);
    expect(report.columns).toHaveLength(9);

    const byKey = Object.fromEntries(report.columns.map((c) => [c.key, c]));

    // Core & catalog columns
    expect(byKey.stt.status).toBe("core");
    expect(byKey.ten_dai_ly.status).toBe("core");
    expect(byKey.ten_khach_hang.status).toBe("core");
    expect(byKey.sdt.status).toBe("core");
    expect(byKey.loai_xe.status).toBe("core");

    // Existing custom field
    expect(byKey.so_cccd.status).toBe("existing");

    // Suggested custom fields
    expect(byKey.loai_khach_hang.status).toBe("suggested");
    expect(byKey.loai_khach_hang.fieldType).toBe("select");
    expect(byKey.loai_khach_hang.options).toEqual(["Cá nhân", "Tổ chức"]);

    expect(byKey.ngay_ky_hop_dong_mua_ban.status).toBe("suggested");
    expect(byKey.ngay_ky_hop_dong_mua_ban.fieldType).toBe("date");

    expect(byKey.gia_xe.status).toBe("suggested");
    expect(byKey.gia_xe.fieldType).toBe("number");
  });
});
