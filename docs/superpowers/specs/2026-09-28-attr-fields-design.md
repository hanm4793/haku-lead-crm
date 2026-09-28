# Project attr field definitions

## Goal

Admin định nghĩa field phụ theo **project**. Lead lưu giá trị trong `leads.attrs` (JSONB). Lead detail render form theo định nghĩa (không còn chỉ read-only dump).

## Model

`project_attr_fields`:
- project_id, key (slug), label, field_type ∈ text | number | select | date
- options jsonb (mảng string cho select)
- required, sort_order, active

Unique (project_id, key).

## Runtime

- Settings → trong project đang chọn: CRUD field defs (super admin).
- Lead detail: input theo type; lưu patch `attrs` qua updateLead.
- FB sync: vẫn merge field_data thừa vào attrs; nếu key trùng field def thì giữ.

## Out of scope

- Filter/report theo từng attr
- Conditional logic / sections
