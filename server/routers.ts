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
  expenseUsd: number;
}) {
  const { buyUsdOz, sellVndWan, rateVndUsd, weightG, expenseUsd } = params;
  const weightOz = weightG / G_PER_OZ;
  const totalCostUsd = weightOz * buyUsdOz;
  const weightChi = weightG / G_PER_CHI;
  const totalRevenueVnd = weightChi * (sellVndWan * 10000);
  const totalRevenueUsd = totalRevenueVnd / rateVndUsd;
  const netProfitUsd = totalRevenueUsd - totalCostUsd - expenseUsd;
  const roi = (netProfitUsd / totalCostUsd) * 100;
  return { totalCostUsd, totalRevenueUsd, netProfitUsd, roi };
}

const calcInputSchema = z.object({
  buyUsdOz: z.number().positive(),
  sellVndWan: z.number().positive(),
  rateVndUsd: z.number().positive(),
  weightG: z.number().positive().default(300),
  expenseUsd: z.number().min(0).default(200),
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
    // 計算套利利潤（不儲存）
    calculate: publicProcedure
      .input(calcInputSchema)
      .mutation(async ({ input }) => {
        const result = calcArbitrage({
          buyUsdOz: input.buyUsdOz,
          sellVndWan: input.sellVndWan,
          rateVndUsd: input.rateVndUsd,
          weightG: input.weightG,
          expenseUsd: input.expenseUsd,
        });

        // 儲存歷史記錄
        if (input.sessionId) {
          await insertCalcHistory({
            buyPriceUsdOz: String(input.buyUsdOz),
            sellPriceVndWan: String(input.sellVndWan),
            rateVndUsd: String(input.rateVndUsd),
            weightG: String(input.weightG),
            expenseUsd: String(input.expenseUsd),
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
            await notifyOwner({
              title: `🚀 高利潤套利機會！ROI ${result.roi.toFixed(2)}%`,
              content: `買價: $${input.buyUsdOz}/oz | 賣價: ${input.sellVndWan}萬VND/錢 | 匯率: ${input.rateVndUsd} | 重量: ${input.weightG}g\n淨利潤: $${result.netProfitUsd.toFixed(2)} USD | ROI: ${result.roi.toFixed(2)}%`,
            });
          } catch (e) {
            // 通知失敗不影響主流程
          }
        }

        return {
          ...result,
          weightOz: input.weightG / G_PER_OZ,
          weightChi: input.weightG / G_PER_CHI,
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
