import { describe, expect, it } from "vitest";

import type { AttrFieldRow } from "@/lib/db/attr-fields-repo";
import type { Lead } from "@/lib/types";

import { attrColumnId, buildAttrColumns, columnHeader, displayValue } from "./columns";

const field = (key: string, label: string, fieldType: AttrFieldRow["fieldType"]): AttrFieldRow => ({
  id: key,
  projectId: "p1",
  key,
  label,
  fieldType,
  options: [],
  required: false,
  sortOrder: 0,
  active: true,
});

const lead = { attrs: { ngan_sach: "1 - 2 tỷ", du_kien_mua: "2026-11-05", so_xe: "2" } } as unknown as Lead;

describe("attr columns", () => {
  const fields = [field("ngan_sach", "Ngân sách", "select"), field("du_kien_mua", "Dự kiến mua", "date"), field("so_xe", "Số xe", "number")];

  it("builds one column per field with attr: id and label header", () => {
    const columns = buildAttrColumns(fields);
    expect(columns.map((c) => c.id)).toEqual(["attr:ngan_sach", "attr:du_kien_mua", "attr:so_xe"]);
    expect(columns.map((c) => c.header)).toEqual(["Ngân sách", "Dự kiến mua", "Số xe"]);
    expect(columns[2].align).toBe("right");
  });

  it("reads raw text and formats date fields", () => {
    expect(displayValue(lead, attrColumnId("ngan_sach"), fields)).toBe("1 - 2 tỷ");
    expect(displayValue(lead, attrColumnId("du_kien_mua"), fields)).toBe("05/11/2026");
    expect(displayValue(lead, attrColumnId("missing"), fields)).toBe("");
  });

  it("falls back to the key when no label is known", () => {
    expect(columnHeader("attr:ngan_sach", undefined, { ngan_sach: "Ngân sách" })).toBe("Ngân sách");
    expect(columnHeader("attr:zzz")).toBe("zzz");
  });
});
