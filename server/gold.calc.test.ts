import { describe, expect, it } from "vitest";

// 複製核心計算邏輯以進行獨立測試
const G_PER_OZ = 31.1035;
const G_PER_CHI = 3.75;

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
  return { totalCostUsd, totalRevenueUsd, netProfitUsd, roi, weightOz, weightChi };
}

describe("Gold Arbitrage Calculator", () => {
  it("should calculate correct values for the reference example", () => {
    // 參考範例: 買價 5298.5 USD/oz, 賣價 1767 萬 VND/錢, 匯率 26825, 300g, 200 USD 開銷
    const result = calcArbitrage({
      buyUsdOz: 5298.5,
      sellVndWan: 1767,
      rateVndUsd: 26825,
      weightG: 300,
      expenseUsd: 200,
    });

    // 重量換算
    expect(result.weightOz).toBeCloseTo(300 / 31.1035, 4);
    expect(result.weightChi).toBeCloseTo(300 / 3.75, 2);

    // 成本計算
    const expectedCost = (300 / G_PER_OZ) * 5298.5;
    expect(result.totalCostUsd).toBeCloseTo(expectedCost, 2);

    // 營收計算
    const expectedRevenue = (300 / G_PER_CHI) * (1767 * 10000) / 26825;
    expect(result.totalRevenueUsd).toBeCloseTo(expectedRevenue, 2);

    // 淨利潤
    const expectedProfit = expectedRevenue - expectedCost - 200;
    expect(result.netProfitUsd).toBeCloseTo(expectedProfit, 2);

    // ROI
    const expectedRoi = (expectedProfit / expectedCost) * 100;
    expect(result.roi).toBeCloseTo(expectedRoi, 2);
  });

  it("should return negative profit when buy price is too high", () => {
    const result = calcArbitrage({
      buyUsdOz: 9999,
      sellVndWan: 1767,
      rateVndUsd: 26825,
      weightG: 300,
      expenseUsd: 200,
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
      expenseUsd: 200,
    });
    expect(result.netProfitUsd).toBeGreaterThan(0);
    expect(result.roi).toBeGreaterThan(0);
  });

  it("should scale linearly with weight", () => {
    const base = calcArbitrage({
      buyUsdOz: 5298.5, sellVndWan: 1767, rateVndUsd: 26825, weightG: 300, expenseUsd: 0,
    });
    const double = calcArbitrage({
      buyUsdOz: 5298.5, sellVndWan: 1767, rateVndUsd: 26825, weightG: 600, expenseUsd: 0,
    });
    expect(double.totalCostUsd).toBeCloseTo(base.totalCostUsd * 2, 2);
    expect(double.totalRevenueUsd).toBeCloseTo(base.totalRevenueUsd * 2, 2);
  });

  it("should correctly convert weight units", () => {
    const result = calcArbitrage({
      buyUsdOz: 5298.5, sellVndWan: 1767, rateVndUsd: 26825, weightG: 31.1035, expenseUsd: 0,
    });
    // 31.1035g = 1 oz
    expect(result.weightOz).toBeCloseTo(1, 4);
    // 31.1035g / 3.75 ≈ 8.294 錢
    expect(result.weightChi).toBeCloseTo(31.1035 / 3.75, 3);
  });

  it("should handle zero expense correctly", () => {
    const withExpense = calcArbitrage({
      buyUsdOz: 5298.5, sellVndWan: 1767, rateVndUsd: 26825, weightG: 300, expenseUsd: 200,
    });
    const withoutExpense = calcArbitrage({
      buyUsdOz: 5298.5, sellVndWan: 1767, rateVndUsd: 26825, weightG: 300, expenseUsd: 0,
    });
    expect(withoutExpense.netProfitUsd - withExpense.netProfitUsd).toBeCloseTo(200, 2);
  });
});
