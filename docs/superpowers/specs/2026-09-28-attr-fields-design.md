# Project attr field definitions

**Status: đã ship.** CRUD trên **Dự án → chi tiết** (`canManageAttrFieldsInProject`), không trên Cài đặt app.

## Model

`project_attr_fields`: `project_id`, `key`, `label`, `field_type` ∈ text | number | select | date, `options` jsonb, `required`, `sort_order`, `active`. Unique `(project_id, key)`.

## Runtime

- Lead lưu giá trị trong `leads.attrs` (JSONB)
- Lead detail: form theo định nghĩa; patch `attrs` qua update lead
- FB sync: merge field Meta thừa vào attrs; trùng `key` với field def thì giữ

## Chưa làm

- Filter / báo cáo theo từng attr
- Conditional logic / sections
