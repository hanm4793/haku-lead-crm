"use client";

import * as React from "react";
import { PhoneCall } from "lucide-react";

import { Pagination } from "@/components/common/pagination";
import {
  CarModelChart,
  CategoryDonut,
  ConversionFunnel,
  DailyLeadChart,
  FailReasonChart,
  SourceComparisonChart,
} from "@/components/reports/charts";
import { useNow } from "@/components/providers/now-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CATEGORY_SHORT_LABEL, DEFAULT_CATALOG_LABELS, SOURCE_LABEL } from "@/lib/constants";
import { isOverdue } from "@/lib/filters";
import type { ReportSummary } from "@/lib/reports/summary";
import type { CatalogLabels, Lead } from "@/lib/types";
import { cn, formatDateTime, formatNumber, formatPercent } from "@/lib/utils";

const REPORT_TABLE_PAGE_SIZES = [10, 25, 50];

export function OverviewTab({
  data,
  totalLeads,
  onSelectLead,
  labels = DEFAULT_CATALOG_LABELS,
}: {
  data: ReportSummary["overview"];
  totalLeads: number;
  onSelectLead: (lead: Lead) => void;
  labels?: CatalogLabels;
}) {
  const now = useNow();
  const {
    daily,
    funnel,
    distribution,
    failReasons = [],
    bySource,
    byModel,
    byAssignee = [],
    byFanpage = [],
    callList,
  } = data;

  const [assigneePage, setAssigneePage] = React.useState(1);
  const [assigneePageSize, setAssigneePageSize] = React.useState(10);
  const [fanpagePage, setFanpagePage] = React.useState(1);
  const [fanpagePageSize, setFanpagePageSize] = React.useState(10);
  const [callPage, setCallPage] = React.useState(1);
  const [callPageSize, setCallPageSize] = React.useState(10);

  const [prevByAssignee, setPrevByAssignee] = React.useState(byAssignee);
  if (prevByAssignee !== byAssignee) {
    setPrevByAssignee(byAssignee);
    setAssigneePage(1);
  }
  const [prevByFanpage, setPrevByFanpage] = React.useState(byFanpage);
  if (prevByFanpage !== byFanpage) {
    setPrevByFanpage(byFanpage);
    setFanpagePage(1);
  }
  const [prevCallList, setPrevCallList] = React.useState(callList);
  if (prevCallList !== callList) {
    setPrevCallList(callList);
    setCallPage(1);
  }

  const safeAssigneePage = Math.min(Math.max(1, assigneePage), Math.max(1, Math.ceil(byAssignee.length / assigneePageSize)));
  const pagedAssignees = byAssignee.slice(
    (safeAssigneePage - 1) * assigneePageSize,
    safeAssigneePage * assigneePageSize,
  );

  const safeFanpagePage = Math.min(Math.max(1, fanpagePage), Math.max(1, Math.ceil(byFanpage.length / fanpagePageSize)));
  const pagedFanpages = byFanpage.slice(
    (safeFanpagePage - 1) * fanpagePageSize,
    safeFanpagePage * fanpagePageSize,
  );

  const safeCallPage = Math.min(Math.max(1, callPage), Math.max(1, Math.ceil(callList.length / callPageSize)));
  const pagedCallList = callList.slice(
    (safeCallPage - 1) * callPageSize,
    safeCallPage * callPageSize,
  );

  const totalFailed = failReasons.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Xu hướng Lead &amp; KHQT+ theo ngày</CardTitle>
            <CardDescription>
              Tổng {formatNumber(totalLeads)} lead trong kỳ (bao gồm các ngày 0 lead để phản ánh đúng xu hướng)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DailyLeadChart data={daily} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Phễu chuyển đổi lũy kế</CardTitle>
            <CardDescription>
              Tỷ lệ chuyển đổi từng bước từ Tổng lead → Đã liên hệ → KHQT+ → GDTD+ → Ký hợp đồng (KHĐ)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConversionFunnel steps={funnel} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Phân bố theo trạng thái phân loại</CardTitle>
            <CardDescription>Tỷ trọng các nhóm phân loại hiện tại trong kỳ</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryDonut data={distribution} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Phân tích lý do Loại (Fail)</CardTitle>
            <CardDescription>
              {totalFailed > 0
                ? `Tổng ${formatNumber(totalFailed)} lead bị loại — đối chiếu chất lượng tệp Marketing & chăm sóc Sale`
                : "Thống kê nguyên nhân khách hàng không chuyển đổi"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FailReasonChart data={failReasons} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lead &amp; KHQT+ theo nguồn</CardTitle>
            <CardDescription>So sánh lượng lead thu về và số khách quan tâm từng kênh</CardDescription>
          </CardHeader>
          <CardContent>
            <SourceComparisonChart data={bySource} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{labels.product} hút khách</CardTitle>
            <CardDescription>Top {labels.product.toLowerCase()} theo số lead &amp; KHQT+</CardDescription>
          </CardHeader>
          <CardContent>
            <CarModelChart data={byModel} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hiệu suất đội ngũ Phụ trách (Sale)</CardTitle>
            <CardDescription>
              Theo dõi khối lượng lead được giao, tồn đọng chưa liên hệ, tỷ lệ KHQT+ và số hợp đồng chốt
            </CardDescription>
          </CardHeader>
          <CardContent>
            {byAssignee.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Chưa có dữ liệu phân bổ nhân sự trong kỳ.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="thin-scrollbar overflow-x-auto">
                  <table className="w-full min-w-[520px] text-[12px]">
                    <thead>
                      <tr className="bg-[#f8fafc] text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 text-left font-semibold">Phụ trách</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Lead</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Chưa LH</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Tỷ lệ LH</th>
                        <th className="px-2.5 py-2 text-right font-semibold">KHQT+</th>
                        <th className="px-2.5 py-2 text-right font-semibold">KHĐ</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Quá hạn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedAssignees.map((row) => (
                        <tr key={row.key} className="border-t border-border/70 hover:bg-[#f6f9ff]">
                          <td className="px-3 py-2 font-medium text-slate-800">{row.key}</td>
                          <td className="px-2.5 py-2 text-right font-semibold tabular-nums">{formatNumber(row.leads)}</td>
                          <td
                            className={cn(
                              "px-2.5 py-2 text-right tabular-nums",
                              row.uncontacted > 0 ? "font-semibold text-amber-600" : "text-slate-500",
                            )}
                          >
                            {formatNumber(row.uncontacted)}
                          </td>
                          <td className="px-2.5 py-2 text-right tabular-nums text-slate-600">
                            {formatPercent(row.contactRate)}
                          </td>
                          <td className="px-2.5 py-2 text-right tabular-nums text-slate-700">
                            <span className="font-semibold text-emerald-700">{formatNumber(row.khqt)}</span>{" "}
                            <span className="text-[10px] text-slate-400">({formatPercent(row.khqtRate)})</span>
                          </td>
                          <td className="px-2.5 py-2 text-right font-semibold tabular-nums text-primary">
                            {formatNumber(row.khd)}
                          </td>
                          <td
                            className={cn(
                              "px-2.5 py-2 text-right tabular-nums",
                              row.overdue > 0 ? "font-semibold text-rose-600" : "text-slate-400",
                            )}
                          >
                            {formatNumber(row.overdue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {byAssignee.length > 10 && (
                  <Pagination
                    page={safeAssigneePage}
                    pageSize={assigneePageSize}
                    total={byAssignee.length}
                    unit="nhân sự"
                    pageSizes={REPORT_TABLE_PAGE_SIZES}
                    onPageChange={setAssigneePage}
                    onPageSizeChange={(size) => {
                      setAssigneePageSize(size);
                      setAssigneePage(1);
                    }}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hiệu quả theo Fanpage</CardTitle>
            <CardDescription>
              Đánh giá số lượng và chất lượng lead (`KHQT+`, `KHĐ`, `Loại`) từ từng trang nguồn
            </CardDescription>
          </CardHeader>
          <CardContent>
            {byFanpage.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Chưa có dữ liệu Fanpage trong kỳ.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="thin-scrollbar overflow-x-auto">
                  <table className="w-full min-w-[520px] text-[12px]">
                    <thead>
                      <tr className="bg-[#f8fafc] text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 text-left font-semibold">Fanpage</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Lead</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Tỷ trọng</th>
                        <th className="px-2.5 py-2 text-right font-semibold">KHQT+</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Tỷ lệ KHQT+</th>
                        <th className="px-2.5 py-2 text-right font-semibold">KHĐ</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Tỷ lệ loại</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedFanpages.map((row) => (
                        <tr key={row.key} className="border-t border-border/70 hover:bg-[#f6f9ff]">
                          <td className="max-w-[200px] truncate px-3 py-2 font-medium text-slate-800" title={row.key}>
                            {row.key}
                          </td>
                          <td className="px-2.5 py-2 text-right font-semibold tabular-nums">{formatNumber(row.leads)}</td>
                          <td className="px-2.5 py-2 text-right tabular-nums text-slate-500">
                            {formatPercent(row.leadShare)}
                          </td>
                          <td className="px-2.5 py-2 text-right font-semibold tabular-nums text-emerald-700">
                            {formatNumber(row.khqt)}
                          </td>
                          <td className="px-2.5 py-2 text-right tabular-nums text-slate-600">
                            {formatPercent(row.khqtRate)}
                          </td>
                          <td className="px-2.5 py-2 text-right font-semibold tabular-nums text-primary">
                            {formatNumber(row.khd)}
                          </td>
                          <td className="px-2.5 py-2 text-right tabular-nums text-rose-600">
                            {formatPercent(row.failRate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {byFanpage.length > 10 && (
                  <Pagination
                    page={safeFanpagePage}
                    pageSize={fanpagePageSize}
                    total={byFanpage.length}
                    unit="fanpage"
                    pageSizes={REPORT_TABLE_PAGE_SIZES}
                    onPageChange={setFanpagePage}
                    onPageSizeChange={(size) => {
                      setFanpagePageSize(size);
                      setFanpagePage(1);
                    }}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách gọi hôm nay</CardTitle>
          <CardDescription>
            Lead quá hạn hoặc có lịch hẹn gọi trong ngày — không phụ thuộc kỳ lọc ngày tạo ở trên
            {callList.length > 0 ? ` · ${callList.length} khách cần gọi` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {callList.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Không có lead quá hạn hoặc hẹn gọi trong hôm nay.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead>
                    <tr className="bg-[#f8fafc] text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 text-left font-semibold">Khách hàng</th>
                      <th className="px-3 py-2 text-left font-semibold">SĐT</th>
                      <th className="px-3 py-2 text-left font-semibold">Phân loại</th>
                      <th className="px-3 py-2 text-left font-semibold">Nguồn</th>
                      <th className="px-3 py-2 text-left font-semibold">Phụ trách</th>
                      <th className="px-3 py-2 text-left font-semibold">Lịch hẹn gọi lại</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedCallList.map((lead) => {
                      const overdue = isOverdue(lead, now);
                      return (
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
                            <span className="inline-flex items-center gap-1.5">
                              <span className={overdue ? "font-medium text-rose-600" : "text-slate-700"}>
                                {formatDateTime(lead.callbackAt)}
                              </span>
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                                  overdue ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700",
                                )}
                              >
                                {overdue ? "Quá hạn" : "Hôm nay"}
                              </span>
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <PhoneCall className="ml-auto size-3.5 text-primary" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={safeCallPage}
                pageSize={callPageSize}
                total={callList.length}
                unit="khách"
                pageSizes={REPORT_TABLE_PAGE_SIZES}
                onPageChange={setCallPage}
                onPageSizeChange={(size) => {
                  setCallPageSize(size);
                  setCallPage(1);
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
