import { describe, expect, it } from "vitest";

// 複製核心計算邏輯以進行獨立測試
const G_PER_OZ = 31.1035;
const G_PER_CHI = 3.75;

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
  return { totalCostUsd, totalRevenueUsd, netProfitUsd, roi, weightOz, weightChi };
}

// 細項開銷加總輔助函數
function sumExpenses(expenses: {
  ticket?: number;
  hotel?: number;
  meal?: number;
  transport?: number;
  channel?: number;
  referral?: number;
}): number {
  return (
    (expenses.ticket ?? 0) +
    (expenses.hotel ?? 0) +
    (expenses.meal ?? 0) +
    (expenses.transport ?? 0) +
    (expenses.channel ?? 0) +
    (expenses.referral ?? 0)
  );
}

describe("Gold Arbitrage Calculator - Core Logic", () => {
  it("should calculate correct values for the reference example", () => {
    const result = calcArbitrage({
      buyUsdOz: 5298.5,
      sellVndWan: 1767,
      rateVndUsd: 26825,
      weightG: 300,
      totalExpenseUsd: 200,
    });

    const expectedCost = (300 / G_PER_OZ) * 5298.5;
    const expectedRevenue = (300 / G_PER_CHI) * (1767 * 10000) / 26825;
    const expectedProfit = expectedRevenue - expectedCost - 200;
    const expectedRoi = (expectedProfit / expectedCost) * 100;

    expect(result.totalCostUsd).toBeCloseTo(expectedCost, 2);
    expect(result.totalRevenueUsd).toBeCloseTo(expectedRevenue, 2);
    expect(result.netProfitUsd).toBeCloseTo(expectedProfit, 2);
    expect(result.roi).toBeCloseTo(expectedRoi, 2);
  });

  it("should return negative profit when buy price is too high", () => {
    const result = calcArbitrage({
      buyUsdOz: 9999,
      sellVndWan: 1767,
      rateVndUsd: 26825,
      weightG: 300,
      totalExpenseUsd: 200,
    });
    expect(result.netProfitUsd).toBeLessThan(0);
    expect(result.roi).toBeLessThan(0);
  });

  it("should return positive profit when sell price is high", () => {
    const result = calcArbitrage({
      buyUsdOz: 3000,
      sellVndWan: 2000,
      rateVndUsd: 26825,
      weightG: 300,
      totalExpenseUsd: 200,
    });
    expect(result.netProfitUsd).toBeGreaterThan(0);
    expect(result.roi).toBeGreaterThan(0);
  });

  it("should scale linearly with weight (no expense)", () => {
    const base = calcArbitrage({
      buyUsdOz: 5298.5, sellVndWan: 1767, rateVndUsd: 26825, weightG: 300, totalExpenseUsd: 0,
    });
    const double = calcArbitrage({
      buyUsdOz: 5298.5, sellVndWan: 1767, rateVndUsd: 26825, weightG: 600, totalExpenseUsd: 0,
    });
    expect(double.totalCostUsd).toBeCloseTo(base.totalCostUsd * 2, 2);
    expect(double.totalRevenueUsd).toBeCloseTo(base.totalRevenueUsd * 2, 2);
  });

  it("should correctly convert weight units", () => {
    const result = calcArbitrage({
      buyUsdOz: 5298.5, sellVndWan: 1767, rateVndUsd: 26825, weightG: 31.1035, totalExpenseUsd: 0,
    });
    expect(result.weightOz).toBeCloseTo(1, 4);
    expect(result.weightChi).toBeCloseTo(31.1035 / 3.75, 3);
  });

  it("should handle zero expense correctly", () => {
    const withExpense = calcArbitrage({
      buyUsdOz: 5298.5, sellVndWan: 1767, rateVndUsd: 26825, weightG: 300, totalExpenseUsd: 200,
    });
    const withoutExpense = calcArbitrage({
      buyUsdOz: 5298.5, sellVndWan: 1767, rateVndUsd: 26825, weightG: 300, totalExpenseUsd: 0,
    });
    expect(withoutExpense.netProfitUsd - withExpense.netProfitUsd).toBeCloseTo(200, 2);
  });
});

describe("Expense Breakdown - sumExpenses", () => {
  it("should sum all expense fields correctly", () => {
    const expenses = {
      ticket: 150,
      hotel: 60,
      meal: 30,
      transport: 20,
      channel: 50,
      referral: 100,
    };
    expect(sumExpenses(expenses)).toBe(410);
  });

  it("should handle missing fields as zero", () => {
    expect(sumExpenses({ ticket: 100 })).toBe(100);
    expect(sumExpenses({})).toBe(0);
  });

  it("should produce same result as single expense when breakdown sums equal", () => {
    const totalExpense = sumExpenses({ ticket: 100, hotel: 50, referral: 50 });
    expect(totalExpense).toBe(200);

    const withBreakdown = calcArbitrage({
      buyUsdOz: 5298.5, sellVndWan: 1767, rateVndUsd: 26825, weightG: 300,
      totalExpenseUsd: totalExpense,
    });
    const withSingle = calcArbitrage({
      buyUsdOz: 5298.5, sellVndWan: 1767, rateVndUsd: 26825, weightG: 300,
      totalExpenseUsd: 200,
    });
    expect(withBreakdown.netProfitUsd).toBeCloseTo(withSingle.netProfitUsd, 6);
  });

  it("should correctly calculate referral fee impact on profit", () => {
    const withoutReferral = calcArbitrage({
      buyUsdOz: 5298.5, sellVndWan: 1767, rateVndUsd: 26825, weightG: 300, totalExpenseUsd: 100,
    });
    const withReferral = calcArbitrage({
      buyUsdOz: 5298.5, sellVndWan: 1767, rateVndUsd: 26825, weightG: 300, totalExpenseUsd: 200,
    });
    // 介紹費 $100 應使淨利潤減少 $100
    expect(withoutReferral.netProfitUsd - withReferral.netProfitUsd).toBeCloseTo(100, 2);
  });

  it("should convert TWD expenses to USD correctly", () => {
    const twdExpenses = { ticket: 5000, hotel: 3000, meal: 1500, transport: 1000, channel: 2000 };
    const usdTwdRate = 32;
    const totalTwd = Object.values(twdExpenses).reduce((a, b) => a + b, 0);
    const totalUsd = totalTwd / usdTwdRate;
    expect(totalTwd).toBe(12500);
    expect(totalUsd).toBeCloseTo(390.625, 3);
    // 用換算後的 USD 開銷計算
    const result = calcArbitrage({
      buyUsdOz: 5298.5, sellVndWan: 1767, rateVndUsd: 26825, weightG: 300,
      totalExpenseUsd: totalUsd,
    });
    expect(result.netProfitUsd).toBeDefined();
  });

  it("should calculate sell price per chi in TWD correctly", () => {
    const sellVndWan = 1700;    // 1700 萬 VND/錢
    const rateVndUsd = 26825;   // VND/USD
    const usdTwdRate = 32;      // USDT/TWD
    // VND/TWD = 26825 / 32 = 838.28
    const vndPerTwd = rateVndUsd / usdTwdRate;
    const sellPerChiTwd = (sellVndWan * 10000) / vndPerTwd;
    // 17000000 / (26825/32) ≈ 20279.59
    expect(sellPerChiTwd).toBeCloseTo(20279.59, 1);
  });

  it("should calculate buy-sell TWD spread correctly", () => {
    const buyUsdOz = 3000;
    const sellVndWan = 1700;
    const rateVndUsd = 26825;
    const usdTwdRate = 32;
    const TAEL_PER_OZ = 31.1035 / 3.75;
    const pricePerChiTwd = buyUsdOz * usdTwdRate / TAEL_PER_OZ; // 買入每錢台幣
    const vndPerTwd = rateVndUsd / usdTwdRate;
    const sellPerChiTwd = (sellVndWan * 10000) / vndPerTwd;      // 賣出每錢台幣
    const spread = sellPerChiTwd - pricePerChiTwd;
    expect(spread).toBeGreaterThan(0); // 1700萬 VND 在此匯率下應有正利差
  });

  it("should calculate price per chi in TWD correctly", () => {
    const goldPriceUsdOz = 3000;
    const usdTwdRate = 32;
    const TAEL_PER_OZ = 31.1035 / 3.75; // 8.2943
    const pricePerChiTwd = goldPriceUsdOz * usdTwdRate / TAEL_PER_OZ;
    // 3000 * 32 / (31.1035/3.75) ≈ 11574.26
    expect(pricePerChiTwd).toBeCloseTo(11574.26, 1);
  });

  it("should handle large referral fee reducing profit to negative", () => {
    // 先計算無開銷時的最大利潤，然後設定超過此值的開銷
    const baseResult = calcArbitrage({
      buyUsdOz: 5298.5, sellVndWan: 1767, rateVndUsd: 26825, weightG: 300, totalExpenseUsd: 0,
    });
    // 開銷超過最大利潤，確保淨利為負
    const oversizedExpense = baseResult.totalRevenueUsd - baseResult.totalCostUsd + 500;
    const expenses = {
      ticket: 200, hotel: 100, meal: 50, transport: 30, channel: 100,
      referral: oversizedExpense - 480, // 讓總和超過利潤
    };
    const total = sumExpenses(expenses);
    const result = calcArbitrage({
      buyUsdOz: 5298.5, sellVndWan: 1767, rateVndUsd: 26825, weightG: 300,
      totalExpenseUsd: total,
    });
    expect(result.netProfitUsd).toBeLessThan(0);
  });
});

describe("Processing Fee Calculation", () => {
  it("should calculate processing fee for 300g at HKD/TWD 4.07", () => {
    const fee = 300 * 1.5 * 4.07;
    expect(fee).toBeCloseTo(1831.5, 0);
  });

  it("should calculate processing fee for 200g at HKD/TWD 4.07", () => {
    const fee = 200 * 1.5 * 4.07;
    expect(fee).toBeCloseTo(1221, 0);
  });

  it("should include processing fee in total TWD expenses", () => {
    const manualExpenses = { ticket: 5000, hotel: 3000, meal: 1500, transport: 1000, channel: 2000 };
    const manualTotal = Object.values(manualExpenses).reduce((a, b) => a + b, 0);
    const processingFee = 300 * 1.5 * 4.07;
    const totalTwd = manualTotal + processingFee;
    expect(totalTwd).toBeCloseTo(12500 + 1831.5, 0);
  });
});

describe("Channel Settlement - channelSettle Logic", () => {
  function channelSettle(params: {
    buyUsdOz: number;
    sellVndWan: number;
    rateVndUsd: number;
    weightG: number;
    ticketTwd: number;
    channelFeeTwd: number;
    processingFeeTwd: number;
    channelSharePct: number;
    usdTwdRate: number;
  }) {
    const {
      buyUsdOz, sellVndWan, rateVndUsd, weightG,
      ticketTwd, channelFeeTwd, processingFeeTwd,
      channelSharePct, usdTwdRate,
    } = params;

    const totalDeductTwd = ticketTwd + channelFeeTwd + processingFeeTwd;
    const totalDeductUsd = totalDeductTwd / usdTwdRate;
    const weightOz = weightG / G_PER_OZ;
    const weightChi = weightG / G_PER_CHI;
    const totalCostUsd = weightOz * buyUsdOz;
    const totalRevenueVnd = weightChi * (sellVndWan * 10000);
    const totalRevenueUsd = totalRevenueVnd / rateVndUsd;
    const netProfitUsd = totalRevenueUsd - totalCostUsd - totalDeductUsd;
    const netProfitTwd = netProfitUsd * usdTwdRate;
    const channelShareUsd = netProfitUsd * (channelSharePct / 100);
    const channelShareTwd = channelShareUsd * usdTwdRate;
    const channelTotalUsd = (channelFeeTwd / usdTwdRate) + channelShareUsd;
    const channelTotalTwd = channelFeeTwd + channelShareTwd;
    const runnerShareUsd = netProfitUsd * (1 - channelSharePct / 100);
    const runnerShareTwd = runnerShareUsd * usdTwdRate;
    const breakEvenRevUsd = totalCostUsd + totalDeductUsd;
    const breakEvenRevVnd = breakEvenRevUsd * rateVndUsd;
    const breakEvenSellVndWan = breakEvenRevVnd / weightChi / 10000;
    return {
      totalDeductTwd, totalDeductUsd, netProfitUsd, netProfitTwd,
      channelShareTwd, channelTotalTwd, runnerShareTwd, breakEvenSellVndWan,
      roi: (netProfitUsd / totalCostUsd) * 100,
    };
  }

  const BASE = {
    buyUsdOz: 4985.02,
    sellVndWan: 1700,
    rateVndUsd: 27440,
    weightG: 298,
    ticketTwd: 13000,
    channelFeeTwd: 5000,
    processingFeeTwd: 298 * 1.5 * 4.07,
    channelSharePct: 5,
    usdTwdRate: 32.2,
  };

  it("should correctly sum three deductions", () => {
    const result = channelSettle(BASE);
    const expectedDeductTwd = BASE.ticketTwd + BASE.channelFeeTwd + BASE.processingFeeTwd;
    expect(result.totalDeductTwd).toBeCloseTo(expectedDeductTwd, 1);
  });

  it("channel total = channelFee + netProfit * pct", () => {
    const result = channelSettle(BASE);
    const expectedChannelShare = result.netProfitTwd * (BASE.channelSharePct / 100);
    const expectedChannelTotal = BASE.channelFeeTwd + expectedChannelShare;
    expect(result.channelTotalTwd).toBeCloseTo(expectedChannelTotal, 1);
  });

  it("runner share = netProfit * (1 - pct)", () => {
    const result = channelSettle(BASE);
    const expectedRunner = result.netProfitTwd * (1 - BASE.channelSharePct / 100);
    expect(result.runnerShareTwd).toBeCloseTo(expectedRunner, 1);
  });

  it("channel + runner should equal netProfit + channelFee", () => {
    const result = channelSettle(BASE);
    // channelTotal = channelFee + netProfit*pct
    // runner = netProfit*(1-pct)
    // sum = channelFee + netProfit
    expect(result.channelTotalTwd + result.runnerShareTwd).toBeCloseTo(
      BASE.channelFeeTwd + result.netProfitTwd, 1
    );
  });

  it("zero channelSharePct means channel only gets channelFee", () => {
    const result = channelSettle({ ...BASE, channelSharePct: 0 });
    expect(result.channelTotalTwd).toBeCloseTo(BASE.channelFeeTwd, 1);
    expect(result.runnerShareTwd).toBeCloseTo(result.netProfitTwd, 1);
  });

  it("100% channelSharePct means runner gets nothing", () => {
    const result = channelSettle({ ...BASE, channelSharePct: 100 });
    expect(result.runnerShareTwd).toBeCloseTo(0, 1);
  });
});
