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

// 細項開銷 schema（不含介紹費，介紹費改為結果區百分比計算）
const expenseBreakdownSchema = z.object({
  ticket: z.number().min(0).default(0),      // 機票費用
  hotel: z.number().min(0).default(0),       // 飯店住宿
  meal: z.number().min(0).default(0),        // 餐飲雜支
  transport: z.number().min(0).default(0),   // 交通車費
  channel: z.number().min(0).default(0),     // 通道費
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
  // 介紹費百分比（0-100），從淨利中扣除
  referralPct: z.number().min(0).max(100).default(0),
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
    // 取得幣安 C2C P2P USDT/VND 賣單報價
    getBinanceC2CRate: publicProcedure
      .input(z.object({
        rank: z.number().int().min(1).max(20).default(5),  // 第幾順位
        offset: z.number().default(50),                    // 加減點數
        rows: z.number().int().min(5).max(20).default(10), // 取幾筆
      }))
      .query(async ({ input }) => {
        try {
          const res = await fetch(
            "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Accept-Encoding": "identity",
                "User-Agent": "Mozilla/5.0",
              },
              body: JSON.stringify({
                fiat: "VND",
                page: 1,
                rows: Math.max(input.rows, input.rank + 2),
                tradeType: "SELL",
                asset: "USDT",
                countries: [],
                proMerchantAds: false,
                shieldMerchantAds: false,
                filterType: "all",
                periods: [],
                additionalKycVerifyFilter: 0,
                publisherType: null,
                payTypes: [],
                classifies: ["mass", "profession", "fiat_trade"],
              }),
              signal: AbortSignal.timeout(8000),
            }
          );
          if (!res.ok) throw new Error(`Binance API error: ${res.status}`);
          const data = await res.json() as {
            data: Array<{
              adv: { price: string; surplusAmount: string; minSingleTransAmount: string; maxSingleTransAmount: string };
              advertiser: { nickName: string; monthOrderCount: number; monthFinishRate: number };
            }>;
          };

          const listings = (data.data ?? []).map((item, i) => ({
            rank: i + 1,
            price: parseFloat(item.adv.price),
            nickName: item.advertiser.nickName,
            available: parseFloat(item.adv.surplusAmount),
            minAmount: parseFloat(item.adv.minSingleTransAmount),
            maxAmount: parseFloat(item.adv.maxSingleTransAmount),
            monthOrders: item.advertiser.monthOrderCount,
            finishRate: item.advertiser.monthFinishRate,
          }));

          // 第N順位（1-based，過濾掉第1筆異常低價）
          // 從第2筆開始取，因為第1筆通常是異常低價廣告
          const normalListings = listings.filter(l => {
            if (listings.length > 1) {
              const secondPrice = listings[1]?.price ?? 0;
              return l.price >= secondPrice * 0.99; // 過濾偏離超過1%的異常價格
            }
            return true;
          });

          const targetIdx = Math.min(input.rank - 1, normalListings.length - 1);
          const targetListing = normalListings[targetIdx];
          const baseRate = targetListing?.price ?? 0;
          const rawFinalRate = baseRate + input.offset;
          // 個位數四捨五入到十位（26897 → 26900）
          const finalRate = Math.round(rawFinalRate / 10) * 10;

          return {
            listings: normalListings.slice(0, Math.min(10, normalListings.length)),
            targetRank: input.rank,
            targetListing,
            baseRate,
            offset: input.offset,
            rawFinalRate,
            finalRate,
            source: "binance-c2c",
            updatedAt: new Date(),
          };
        } catch (err) {
          return {
            listings: [],
            targetRank: input.rank,
            targetListing: null,
            baseRate: null,
            offset: input.offset,
            finalRate: null,
            source: "error",
            error: String(err),
            updatedAt: new Date(),
          };
        }
      }),

    // 取得倫敦金現貨價格 (USD/oz)
    getGoldSpotPrice: publicProcedure.query(async () => {
      // 主要： stooq.com XAU/USD 現貨
      try {
        const res = await fetch(
          "https://stooq.com/q/l/?s=xauusd&f=sd2t2ohlcv&h&e=json",
          {
            headers: { "Accept-Encoding": "identity", "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(6000),
          }
        );
        if (!res.ok) throw new Error(`stooq error: ${res.status}`);
        const raw = await res.text();
        // stooq 回傳格式有時 volume 為空，需要修復 JSON
        const fixed = raw.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
        const data = JSON.parse(fixed) as { symbols: Array<{ close: number; date: string; time: string }> };
        const item = data.symbols?.[0];
        if (!item?.close || item.close <= 0) throw new Error("Invalid price");
        return {
          price: item.close,
          source: "stooq-xauusd",
          note: "XAU/USD 現貨",
          updatedAt: new Date(),
        };
      } catch (e1) {
        // 備用： Yahoo Finance COMEX 黃金期貨 GC=F
        try {
          const res2 = await fetch(
            "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=1d",
            {
              headers: { "Accept-Encoding": "identity", "User-Agent": "Mozilla/5.0" },
              signal: AbortSignal.timeout(6000),
            }
          );
          if (!res2.ok) throw new Error(`Yahoo error: ${res2.status}`);
          const data2 = await res2.json() as { chart: { result: Array<{ meta: { regularMarketPrice: number } }> } };
          const price2 = data2.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (!price2 || price2 <= 0) throw new Error("Invalid Yahoo price");
          return {
            price: price2,
            source: "yahoo-gcf",
            note: "COMEX 黃金期貨",
            updatedAt: new Date(),
          };
        } catch (e2) {
          // 第三備用： 幣安 PAXG/USDT
          try {
            const res3 = await fetch(
              "https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT",
              { signal: AbortSignal.timeout(5000) }
            );
            if (!res3.ok) throw new Error(`Binance error: ${res3.status}`);
            const data3 = await res3.json() as { price: string };
            const price3 = parseFloat(data3.price);
            if (!price3 || price3 <= 0) throw new Error("Invalid PAXG price");
            return {
              price: price3,
              source: "binance-paxg",
              note: "PAXG/USDT (幣安黃金代幣)",
              updatedAt: new Date(),
            };
          } catch (e3) {
            return { price: null, source: "error", note: "所有 API 均失敗", updatedAt: new Date() };
          }
        }
      }
    }),

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
        // 計算總開銷：細項加總 or 舊版單一值（不含介紹費）
        const expBreakdown = input.expenses ?? {
          ticket: 0, hotel: 0, meal: 0, transport: 0, channel: 0,
        };
        const breakdownTotal =
          expBreakdown.ticket + expBreakdown.hotel + expBreakdown.meal +
          expBreakdown.transport + expBreakdown.channel;
        const totalExpenseUsd = breakdownTotal > 0 ? breakdownTotal : input.expenseUsd;

        const result = calcArbitrage({
          buyUsdOz: input.buyUsdOz,
          sellVndWan: input.sellVndWan,
          rateVndUsd: input.rateVndUsd,
          weightG: input.weightG,
          totalExpenseUsd,
        });

        // 介紹費計算（從淨利中扣除）
        const referralPct = input.referralPct ?? 0;
        const referralFee = result.netProfitUsd * (referralPct / 100);
        const actualNetProfit = result.netProfitUsd - referralFee;
        const actualRoi = (actualNetProfit / result.totalCostUsd) * 100;

        // 保本賣價（萬VND/錢）：在當前成本+開銷下的最低賣價
        const weightChi = input.weightG / G_PER_CHI;
        const breakEvenRevUsd = result.totalCostUsd + totalExpenseUsd;
        const breakEvenRevVnd = breakEvenRevUsd * input.rateVndUsd;
        const breakEvenSellVndWan = breakEvenRevVnd / weightChi / 10000;

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
            const expDetail = `機票$${expBreakdown.ticket} 住宿$${expBreakdown.hotel} 餐飲$${expBreakdown.meal} 交通$${expBreakdown.transport} 通道$${expBreakdown.channel}`;
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
          referralPct,
          referralFee,
          actualNetProfit,
          actualRoi,
          breakEvenSellVndWan,
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
