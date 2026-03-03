import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { notifyOwner } from "./_core/notification";
import {
  insertCalcHistory,
  getCalcHistoryBySession,
  deleteCalcHistoryBySession,
} from "./db";

// ---- 黃金套利計算核心邏輯 ----
const G_PER_OZ = 31.1035;
const G_PER_CHI = 3.75; // 1錢 = 3.75克

function calcArbitrage(params: {
  buyUsdOz: number;
  sellVndWan: number;
  rateVndUsd: number;
  weightG: number;
  totalExpenseUsd: number;
}) {
  const { buyUsdOz, sellVndWan, rateVndUsd, weightG, totalExpenseUsd } = params;
  const weightOz = weightG / G_PER_OZ;
  const totalCostUsd = weightOz * buyUsdOz;
  const weightChi = weightG / G_PER_CHI;
  const totalRevenueVnd = weightChi * (sellVndWan * 10000);
  const totalRevenueUsd = totalRevenueVnd / rateVndUsd;
  const netProfitUsd = totalRevenueUsd - totalCostUsd - totalExpenseUsd;
  const roi = (netProfitUsd / totalCostUsd) * 100;
  return { totalCostUsd, totalRevenueUsd, netProfitUsd, roi };
}

// 細項開銷 schema
const expenseBreakdownSchema = z.object({
  ticket: z.number().min(0).default(0),      // 機票費用
  hotel: z.number().min(0).default(0),       // 飯店住宿
  meal: z.number().min(0).default(0),        // 餐飲雜支
  transport: z.number().min(0).default(0),   // 交通車費
  channel: z.number().min(0).default(0),     // 通道費
  referral: z.number().min(0).default(0),    // 介紹費
});

const calcInputSchema = z.object({
  buyUsdOz: z.number().positive(),
  sellVndWan: z.number().positive(),
  rateVndUsd: z.number().positive(),
  weightG: z.number().positive().default(300),
  // 舊版單一開銷（向後相容）
  expenseUsd: z.number().min(0).default(0),
  // 新版細項開銷
  expenses: expenseBreakdownSchema.optional(),
  sessionId: z.string().optional(),
  roiAlertThreshold: z.number().optional().default(2),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  gold: router({
    // 取得即時 VND/USD 匯率
    getExchangeRate: publicProcedure.query(async () => {
      try {
        const res = await fetch(
          "https://api.exchangerate-api.com/v4/latest/USD",
          { signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) throw new Error("API error");
        const data = await res.json() as { rates: Record<string, number> };
        const vndRate = data.rates["VND"];
        if (!vndRate) throw new Error("VND rate not found");
        return { rate: vndRate, source: "exchangerate-api", updatedAt: new Date() };
      } catch {
        // 備用 API
        try {
          const res2 = await fetch(
            "https://open.er-api.com/v6/latest/USD",
            { signal: AbortSignal.timeout(5000) }
          );
          if (!res2.ok) throw new Error("Backup API error");
          const data2 = await res2.json() as { rates: Record<string, number> };
          const vndRate2 = data2.rates["VND"];
          if (!vndRate2) throw new Error("VND rate not found");
          return { rate: vndRate2, source: "open.er-api", updatedAt: new Date() };
        } catch {
          return { rate: null, source: "error", updatedAt: new Date() };
        }
      }
    }),

    // 計算套利利潤
    calculate: publicProcedure
      .input(calcInputSchema)
      .mutation(async ({ input }) => {
        // 計算總開銷：細項加總 or 舊版單一值
        const expBreakdown = input.expenses ?? {
          ticket: 0, hotel: 0, meal: 0, transport: 0, channel: 0, referral: 0,
        };
        const breakdownTotal =
          expBreakdown.ticket + expBreakdown.hotel + expBreakdown.meal +
          expBreakdown.transport + expBreakdown.channel + expBreakdown.referral;
        const totalExpenseUsd = breakdownTotal > 0 ? breakdownTotal : input.expenseUsd;

        const result = calcArbitrage({
          buyUsdOz: input.buyUsdOz,
          sellVndWan: input.sellVndWan,
          rateVndUsd: input.rateVndUsd,
          weightG: input.weightG,
          totalExpenseUsd,
        });

        // 儲存歷史記錄
        if (input.sessionId) {
          await insertCalcHistory({
            buyPriceUsdOz: String(input.buyUsdOz),
            sellPriceVndWan: String(input.sellVndWan),
            rateVndUsd: String(input.rateVndUsd),
            weightG: String(input.weightG),
            expenseUsd: String(totalExpenseUsd),
            totalCostUsd: String(result.totalCostUsd),
            totalRevenueUsd: String(result.totalRevenueUsd),
            netProfitUsd: String(result.netProfitUsd),
            roi: String(result.roi),
            sessionId: input.sessionId,
          });
        }

        // 高利潤通知
        const threshold = input.roiAlertThreshold ?? 2;
        if (result.roi > threshold) {
          try {
            const expDetail = `機票$${expBreakdown.ticket} 住宿$${expBreakdown.hotel} 餐飲$${expBreakdown.meal} 交通$${expBreakdown.transport} 通道$${expBreakdown.channel} 介紹$${expBreakdown.referral}`;
            await notifyOwner({
              title: `🚀 高利潤套利機會！ROI ${result.roi.toFixed(2)}%`,
              content: `買價: $${input.buyUsdOz}/oz | 賣價: ${input.sellVndWan}萬VND/錢 | 匯率: ${input.rateVndUsd} | 重量: ${input.weightG}g\n開銷: $${totalExpenseUsd} (${expDetail})\n淨利潤: $${result.netProfitUsd.toFixed(2)} USD | ROI: ${result.roi.toFixed(2)}%`,
            });
          } catch {
            // 通知失敗不影響主流程
          }
        }

        return {
          ...result,
          weightOz: input.weightG / G_PER_OZ,
          weightChi: input.weightG / G_PER_CHI,
          totalExpenseUsd,
          expenseBreakdown: expBreakdown,
        };
      }),

    // 取得歷史記錄
    getHistory: publicProcedure
      .input(z.object({ sessionId: z.string() }))
      .query(async ({ input }) => {
        return getCalcHistoryBySession(input.sessionId, 50);
      }),

    // 清除歷史記錄
    clearHistory: publicProcedure
      .input(z.object({ sessionId: z.string() }))
      .mutation(async ({ input }) => {
        await deleteCalcHistoryBySession(input.sessionId);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
