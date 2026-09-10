/** Bản xem trước của một lệnh export, tính ở server rồi trả về cho khung chat. */
export interface ExportPreview {
  total: number;
  sheets: { name: string; count: number }[];
  kpis: { label: string; value: string }[];
}
