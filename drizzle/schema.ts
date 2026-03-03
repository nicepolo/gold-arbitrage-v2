import { decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// 計算歷史記錄表
export const calcHistory = mysqlTable("calc_history", {
  id: int("id").autoincrement().primaryKey(),
  // 輸入參數
  buyPriceUsdOz: decimal("buy_price_usd_oz", { precision: 10, scale: 4 }).notNull(),
  sellPriceVndWan: decimal("sell_price_vnd_wan", { precision: 10, scale: 2 }).notNull(),
  rateVndUsd: decimal("rate_vnd_usd", { precision: 12, scale: 2 }).notNull(),
  weightG: decimal("weight_g", { precision: 8, scale: 2 }).notNull(),
  expenseUsd: decimal("expense_usd", { precision: 10, scale: 2 }).notNull(),
  // 計算結果
  totalCostUsd: decimal("total_cost_usd", { precision: 12, scale: 4 }).notNull(),
  totalRevenueUsd: decimal("total_revenue_usd", { precision: 12, scale: 4 }).notNull(),
  netProfitUsd: decimal("net_profit_usd", { precision: 12, scale: 4 }).notNull(),
  roi: decimal("roi", { precision: 8, scale: 4 }).notNull(),
  // 元資料
  sessionId: varchar("session_id", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CalcHistory = typeof calcHistory.$inferSelect;
export type InsertCalcHistory = typeof calcHistory.$inferInsert;
