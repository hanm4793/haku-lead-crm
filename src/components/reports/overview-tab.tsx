"use client";

import { PhoneCall } from "lucide-react";

import {
  CarModelChart,
  CategoryDonut,
  ConversionFunnel,
  DailyLeadChart,
  SourceComparisonChart,
} from "@/components/reports/charts";
import { useNow } from "@/components/providers/now-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CATEGORY_SHORT_LABEL, SOURCE_LABEL } from "@/lib/constants";
import { isOverdue } from "@/lib/filters";
import type { ReportSummary } from "@/lib/reports/summary";
import type { Lead } from "@/lib/types";
import { formatDate, formatNumber } from "@/lib/utils";

export function OverviewTab({
  data,
  totalLeads,
  onSelectLead,
}: {
  data: ReportSummary["overview"];
  totalLeads: number;
  onSelectLead: (lead: Lead) => void;
}) {
  const now = useNow();
  const { daily, funnel, distribution, bySource, byModel, callList } = data;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lead mới theo ngày</CardTitle>
            <CardDescription>Tổng {formatNumber(totalLeads)} lead trong kỳ</CardDescription>
          </CardHeader>
          <CardContent>
            <DailyLeadChart data={daily} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Phễu chuyển đổi</CardTitle>
            <CardDescription>% bên phải là tỷ lệ chuyển đổi qua các bậc</CardDescription>
          </CardHeader>
          <CardContent>
            <ConversionFunnel steps={funnel} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Phân bố theo trạng thái</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryDonut data={distribution} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead &amp; KHQT theo nguồn</CardTitle>
            <CardDescription>Số lead và KHQT từng kênh</CardDescription>
          </CardHeader>
          <CardContent>
            <SourceComparisonChart data={bySource} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dòng xe hút khách</CardTitle>
          <CardDescription>Top dòng xe theo số lead</CardDescription>
        </CardHeader>
        <CardContent>
          <CarModelChart data={byModel} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách gọi hôm nay</CardTitle>
          <CardDescription>Các lead quá hạn hoặc đến hạn cần liên hệ</CardDescription>
        </CardHeader>
        <CardContent>
          {callList.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Không có lead quá hạn.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-[#f8fafc] text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 text-left font-semibold">Khách hàng</th>
                    <th className="px-3 py-2 text-left font-semibold">SĐT</th>
                    <th className="px-3 py-2 text-left font-semibold">Phân loại</th>
                    <th className="px-3 py-2 text-left font-semibold">Nguồn</th>
                    <th className="px-3 py-2 text-left font-semibold">Phụ trách</th>
                    <th className="px-3 py-2 text-left font-semibold">Hẹn gọi lại</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {callList.map((lead) => (
                    <tr
                      key={lead.id}
                      className="cursor-pointer border-t border-border/70 hover:bg-[#f6f9ff]"
                      onClick={() => onSelectLead(lead)}
                    >
                      <td className="px-3 py-2 font-medium text-slate-800">{lead.name ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-600">{lead.phone}</td>
                      <td className="px-3 py-2 text-slate-600">{CATEGORY_SHORT_LABEL[lead.category]}</td>
                      <td className="px-3 py-2 text-slate-600">{SOURCE_LABEL[lead.source]}</td>
                      <td className="px-3 py-2 text-slate-600">{lead.assignee ?? "Chưa giao"}</td>
                      <td className="px-3 py-2">
                        <span className={isOverdue(lead, now) ? "font-medium text-rose-600" : "text-slate-600"}>
                          {formatDate(lead.callbackAt)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <PhoneCall className="ml-auto size-3.5 text-primary" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
