import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { ASSIGNEES, CAR_MODELS_BY_BRAND, SALES_ROOMS, SHOWROOMS } from "../src/lib/constants";
import * as schema from "../src/lib/db/schema";
import { generateDemoData } from "../src/lib/mock-data";
import type { Brand } from "../src/lib/types";

const seedDemoLeads =
  process.env.SEED_DEMO_LEADS === "1" || process.argv.includes("--demo");

const CHUNK = 500;

function chunked<T>(rows: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Tên phòng bán hàng có dạng "KIA MAZDA_PHÒNG 1_Trần Thanh Điệp" — phần sau dấu
 * gạch dưới cuối là trưởng phòng, dùng để nối sang app_users.
 */
function managerNameOf(salesRoom: string) {
  return salesRoom.split("_").pop()?.trim() ?? null;
}

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Thiếu DIRECT_URL (hoặc DATABASE_URL) trong .env.local.");
  }

  const sql = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(sql, { schema });

  console.log("Xóa dữ liệu cũ…");
  // activity_logs xóa theo cascade của leads, nhưng xóa tường minh cho rõ ràng.
  await db.delete(schema.activityLogs);
  await db.delete(schema.leads);
  await db.delete(schema.salesRooms);
  await db.delete(schema.appUsers);
  await db.delete(schema.carModels);
  await db.delete(schema.showrooms);

  console.log("Nạp dữ liệu tham chiếu…");

  const showroomRows = await db
    .insert(schema.showrooms)
    .values(SHOWROOMS.map((name, i) => ({ name, sortOrder: i })))
    .returning({ id: schema.showrooms.id, name: schema.showrooms.name });
  const showroomIdByName = new Map(showroomRows.map((r) => [r.name, r.id]));

  // Người đầu danh sách làm ADMIN để có sẵn một tài khoản nhìn được toàn bộ dữ liệu.
  const userRows = await db
    .insert(schema.appUsers)
    .values(
      ASSIGNEES.map((fullName, i) => ({
        fullName,
        role: i === 0 ? ("ADMIN" as const) : ("SALES" as const),
      })),
    )
    .returning({ id: schema.appUsers.id, fullName: schema.appUsers.fullName });
  const userIdByName = new Map(userRows.map((r) => [r.fullName, r.id]));

  const salesRoomRows = await db
    .insert(schema.salesRooms)
    .values(
      SALES_ROOMS.map((name) => {
        const manager = managerNameOf(name);
        return { name, managerId: manager ? (userIdByName.get(manager) ?? null) : null };
      }),
    )
    .returning({ id: schema.salesRooms.id, name: schema.salesRooms.name });
  const salesRoomIdByName = new Map(salesRoomRows.map((r) => [r.name, r.id]));

  const carModelValues = Object.entries(CAR_MODELS_BY_BRAND).flatMap(([brand, models]) =>
    models.map((name) => ({ brand: brand as Brand, name })),
  );
  const carModelRows = await db
    .insert(schema.carModels)
    .values(carModelValues)
    .returning({ id: schema.carModels.id, brand: schema.carModels.brand, name: schema.carModels.name });
  const carModelIdByKey = new Map(carModelRows.map((r) => [`${r.brand}|${r.name}`, r.id]));

  console.log(
    `  ${showroomRows.length} showroom · ${userRows.length} nhân sự · ${salesRoomRows.length} phòng bán hàng · ${carModelRows.length} dòng xe`,
  );

  if (!seedDemoLeads) {
    await sql.end();
    console.log("Chỉ nạp danh mục (không có lead demo). Chạy pnpm db:seed:demo nếu cần 704 lead mẫu.");
    return;
  }

  console.log("Sinh dữ liệu demo…");
  const { leads, logsByLead } = generateDemoData(new Date());

  // Sinh uuid tại đây thay vì dựa vào RETURNING: Postgres không đảm bảo thứ tự
  // hàng trả về khớp thứ tự VALUES, mà activity log cần nối đúng lead.
  const mockIdToDbId = new Map(leads.map((lead) => [lead.id, randomUUID()]));

  const leadValues = leads.map((lead) => {
    const showroomId = showroomIdByName.get(lead.showroom);
    const salesRoomId = salesRoomIdByName.get(lead.salesRoom);
    if (!showroomId || !salesRoomId) {
      throw new Error(`Không map được showroom/phòng bán hàng cho lead ${lead.id}`);
    }

    return {
      id: mockIdToDbId.get(lead.id)!,
      createdAt: new Date(lead.createdAt),
      updatedAt: new Date(lead.createdAt),
      name: lead.name,
      phone: lead.phone,
      contactStatus: lead.contactStatus,
      category: lead.category,
      failReason: lead.failReason,
      pushedToB10: lead.pushedToB10,
      b10Status: lead.b10Status,
      b10CareNote: lead.b10CareNote,
      source: lead.source,
      channelDetail: lead.channelDetail,
      brand: lead.brand,
      showroomId,
      salesRoomId,
      assigneeId: lead.assignee ? (userIdByName.get(lead.assignee) ?? null) : null,
      carModelId: lead.carModel ? (carModelIdByKey.get(`${lead.brand}|${lead.carModel}`) ?? null) : null,
      careNote: lead.careNote,
      callbackAt: lead.callbackAt ? new Date(lead.callbackAt) : null,
      contactCount: lead.contactCount,
      lastContactAt: lead.lastContactAt ? new Date(lead.lastContactAt) : null,
      campaign: lead.campaign,
      adContent: lead.adContent,
      costPerLead: lead.costPerLead,
    };
  });

  console.log(`Nạp ${leadValues.length} lead…`);
  for (const batch of chunked(leadValues)) {
    await db.insert(schema.leads).values(batch);
  }

  const logValues = [...logsByLead.entries()].flatMap(([mockLeadId, logs]) => {
    const leadId = mockIdToDbId.get(mockLeadId);
    if (!leadId) return [];
    return logs.map((log) => ({
      leadId,
      kind: log.kind,
      message: log.message,
      at: new Date(log.at),
      actorId: userIdByName.get(log.actor) ?? null,
      actorName: log.actor,
      byAi: log.byAi ?? false,
    }));
  });

  console.log(`Nạp ${logValues.length} dòng lịch sử hoạt động…`);
  for (const batch of chunked(logValues)) {
    await db.insert(schema.activityLogs).values(batch);
  }

  await sql.end();
  console.log("Xong.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
