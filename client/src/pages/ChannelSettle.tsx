import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  TrendingUp,
  Calculator,
  RefreshCw,
  Lock,
  Plus,
  Minus,
  Copy,
  UserCheck,
  ArrowLeft,
  Plane,
} from "lucide-react";
import { useState, useCallback, useMemo } from "react";
import { Link } from "wouter";

const WEIGHT_PRESETS = [200, 280, 300];
const G_PER_OZ = 31.1035;
const G_PER_CHI = 3.75;

export default function ChannelSettle() {
  // State
  const [csWeightG, setCsWeightG] = useState("300");
  const [csBuyUsdOz, setCsBuyUsdOz] = useState("");
  const [csSellVndWan, setCsSellVndWan] = useState("");
  const [csRateVndUsd, setCsRateVndUsd] = useState("");
  const [csChannelFeeTwd, setCsChannelFeeTwd] = useState("");
  const [csTicketTwd, setCsTicketTwd] = useState("");
  const [csChannelSharePct, setCsChannelSharePct] = useState("");
  const [csResult, setCsResult] = useState<null | {
    weightOz: number; weightChi: number;
    totalCostUsd: number; totalRevenueUsd: number;
    processingFeeTwd: number; ticketTwd: number;
    netProfitUsd: number; netProfitTwd: number;
    grossProfitUsd: number; grossProfitTwd: number;
    channelFeeTwd: number; channelSharePct: number;
    channelShareUsd: number; channelShareTwd: number;
    channelTotalUsd: number; channelTotalTwd: number;
    customerShareUsd: number; customerShareTwd: number;
    breakEvenSellVndWan: number; roi: number;
  }>(null);

  // HKD/TWD 即時匯率
  const { data: hkdTwdData } = trpc.gold.getHkdTwdRate.useQuery(
    undefined,
    { enabled: true, retry: false, staleTime: 300000 }
  );
  const hkdTwdRate = hkdTwdData?.rate ?? 4.07;

  // BitoEX USDT/TWD 匯率
  const { data: bitoData } = trpc.gold.getBitoUsdtTwd.useQuery(
    undefined,
    { enabled: true, retry: false, staleTime: 60000 }
  );
  const usdTwdRate = bitoData?.adjustedRate
    ? Math.round(bitoData.adjustedRate * 10) / 10
    : 32;

  // 加工費自動計算
  const csProcessingFeeTwd = useMemo(() => {
    const w = parseFloat(csWeightG);
    if (!w || !hkdTwdRate) return 0;
    return w * 1.5 * hkdTwdRate;
  }, [csWeightG, hkdTwdRate]);

  const channelSettleMutation = trpc.gold.channelSettle.useMutation({
    onSuccess: (data) => {
      setCsResult(data);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleChannelSettle = useCallback(() => {
    const buy = parseFloat(csBuyUsdOz);
    const sell = parseFloat(csSellVndWan);
    const rate = parseFloat(csRateVndUsd);
    const weight = parseFloat(csWeightG);
    const sharePct = parseFloat(csChannelSharePct);

    if (!buy || !sell || !rate || !weight) {
      toast.error("請填寫所有必填欄位");
      return;
    }
    if (!csChannelSharePct || isNaN(sharePct)) {
      toast.error("請填寫通道分成比例");
      return;
    }

    channelSettleMutation.mutate({
      buyUsdOz: buy,
      sellVndWan: sell,
      rateVndUsd: rate,
      weightG: weight,
      channelFeeTwd: parseFloat(csChannelFeeTwd) || 0,
      processingFeeTwd: csProcessingFeeTwd,
      ticketTwd: parseFloat(csTicketTwd) || 0,
      channelSharePct: sharePct,
      usdTwdRate,
    });
  }, [csBuyUsdOz, csSellVndWan, csRateVndUsd, csWeightG, csChannelFeeTwd, csTicketTwd, csChannelSharePct, csProcessingFeeTwd, usdTwdRate, channelSettleMutation]);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full geo-blob-blue opacity-70" />
        <div className="absolute top-1/2 -left-56 w-96 h-96 rounded-full geo-blob-pink opacity-60" />
        <div className="absolute bottom-0 right-1/3 w-72 h-72 rounded-full geo-blob-gold opacity-50" />
        <svg className="absolute top-0 left-0 w-full h-full opacity-[0.035]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid2" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="currentColor" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid2)" />
        </svg>
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-border/60 bg-card/90 backdrop-blur-sm">
        <div className="container py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, oklch(0.55 0.20 45), oklch(0.48 0.18 35))" }}>
              <UserCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground leading-none">
                通道結算
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                淨利 = 營收 - 成本 - 加工費 - 機票費
              </p>
            </div>
          </div>

          {/* Back to arbitrage */}
          <Link href="/">
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
              <ArrowLeft className="w-3.5 h-3.5" />
              套利計算
            </button>
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 container py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: Input Panel */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
              <div className="flex items-center gap-2 mb-5">
                <UserCheck className="w-4.5 h-4.5" style={{ color: "oklch(0.55 0.20 45)" }} />
                <h2 className="text-base font-semibold">結算參數</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-5">
                淨利 = 總營收 − 購買成本 − 加工費 − 機票費
              </p>

              <div className="space-y-4">
                {/* Weight */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">黃金重量 (克)</Label>
                  <div className="flex gap-2 mb-2">
                    {WEIGHT_PRESETS.map((w) => (
                      <button key={w} onClick={() => setCsWeightG(String(w))}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                          csWeightG === String(w) ? "text-white border-transparent" : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                        }`}
                        style={csWeightG === String(w) ? { background: "linear-gradient(135deg, oklch(0.55 0.20 45), oklch(0.48 0.18 35))" } : {}}>
                        {w}g
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setCsWeightG(v => String(Math.max(0, (parseFloat(v)||0)-1)))}
                      className="w-10 h-10 rounded-lg border border-border flex items-center justify-center hover:bg-secondary transition-colors flex-shrink-0 text-muted-foreground hover:text-foreground">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <Input type="number" value={csWeightG} onChange={e => setCsWeightG(e.target.value)}
                      placeholder="e.g. 300" className="bg-input border-border flex-1" />
                    <button onClick={() => setCsWeightG(v => String((parseFloat(v)||0)+1))}
                      className="w-10 h-10 rounded-lg border border-border flex items-center justify-center hover:bg-secondary transition-colors flex-shrink-0 text-muted-foreground hover:text-foreground">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {parseFloat(csWeightG) > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ≈ {(parseFloat(csWeightG)/G_PER_OZ).toFixed(4)} oz &nbsp;·&nbsp; {(parseFloat(csWeightG)/G_PER_CHI).toFixed(2)} 錢
                    </p>
                  )}
                </div>

                {/* Buy price */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">香港買價 (USD/oz)</Label>
                  <Input type="number" value={csBuyUsdOz} onChange={e => setCsBuyUsdOz(e.target.value)}
                    placeholder="e.g. 4985" className="bg-input border-border" />
                </div>

                {/* Sell price */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">越南賣價 (萬 VND/錢)</Label>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setCsSellVndWan(v => String(Math.max(0, (parseFloat(v)||0)-1)))}
                      className="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-secondary transition-colors flex-shrink-0 text-muted-foreground hover:text-foreground">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <Input type="number" value={csSellVndWan} onChange={e => setCsSellVndWan(e.target.value)}
                      placeholder="e.g. 1700" className="bg-input border-border flex-1" />
                    <button onClick={() => setCsSellVndWan(v => String((parseFloat(v)||0)+1))}
                      className="w-10 h-10 rounded-full border border-border flex items-center justify-center hover:bg-secondary transition-colors flex-shrink-0 text-muted-foreground hover:text-foreground">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* VND/USD Rate */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">匯率 (VND/USD)</Label>
                  <Input type="number" value={csRateVndUsd} onChange={e => setCsRateVndUsd(e.target.value)}
                    placeholder="e.g. 27440" className="bg-input border-border" />
                </div>

                {/* 開銷區塊 */}
                <div className="border-t border-border/60 pt-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-3">開銷（TWD）</p>
                  <div className="space-y-3">
                    {/* 通道費 */}
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5 text-rose-500" />通道費 TWD
                      </Label>
                      <Input type="number" value={csChannelFeeTwd} onChange={e => setCsChannelFeeTwd(e.target.value)}
                        placeholder="0" className="bg-input border-border" />
                    </div>

                    {/* 加工費（唯讀） */}
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                        <span className="text-orange-500">⚙️</span>加工費 TWD
                        <span className="text-xs text-muted-foreground ml-1">(自動計算)</span>
                      </Label>
                      <div className="bg-secondary/60 border border-border/40 rounded-md px-3 py-2 text-sm text-muted-foreground">
                        NT${csProcessingFeeTwd.toFixed(0)}
                        <span className="text-xs ml-2">({parseFloat(csWeightG)||0}g × HK$1.5 × {hkdTwdRate.toFixed(2)})</span>
                      </div>
                    </div>

                    {/* 機票費 */}
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                        <Plane className="w-3.5 h-3.5 text-blue-500" />機票費 TWD
                      </Label>
                      <Input type="number" value={csTicketTwd} onChange={e => setCsTicketTwd(e.target.value)}
                        placeholder="0" className="bg-input border-border" />
                    </div>
                  </div>

                  {/* 開銷小計（不含通道費，通道費在分配時才計算） */}
                  <div className="mt-3 flex justify-between text-xs text-muted-foreground border-t border-border/40 pt-2">
                    <span>扣淨利開銷（加工+機票）</span>
                    <span className="font-medium">NT${(csProcessingFeeTwd + (parseFloat(csTicketTwd)||0)).toFixed(0)}</span>
                  </div>
                </div>

                {/* 通道分成比例 */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">通道分成比例 (%)</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" value={csChannelSharePct} onChange={e => setCsChannelSharePct(e.target.value)}
                      placeholder="請輸入百分比" className="bg-input border-border flex-1" />
                    <span className="text-sm text-muted-foreground flex-shrink-0">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">通道方從淨利中收取的百分比</p>
                </div>

                {/* 計算按鈕 */}
                <button
                  onClick={handleChannelSettle}
                  disabled={channelSettleMutation.isPending}
                  className="w-full py-3 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, oklch(0.55 0.20 45), oklch(0.48 0.18 35))" }}
                >
                  {channelSettleMutation.isPending
                    ? <><RefreshCw className="w-4 h-4 animate-spin" />計算中...</>
                    : <><Calculator className="w-4 h-4" />計算結算</>}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Result Panel */}
          <div className="lg:col-span-3 space-y-4">
            {!csResult ? (
              <div className="bg-card rounded-2xl border border-border shadow-sm p-8 flex flex-col items-center justify-center min-h-[300px] text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-secondary">
                  <UserCheck className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">請在左側輸入參數並點擊「計算結算」</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 結算概覽 */}
                <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <TrendingUp className="w-4.5 h-4.5" style={{ color: "oklch(0.55 0.20 45)" }} />
                    <h2 className="text-base font-semibold">結算概覽</h2>
                  </div>

                  {/* 淨利卡片 */}
                  <div className="rounded-xl p-4 mb-4" style={{
                    background: csResult.netProfitTwd >= 0
                      ? "linear-gradient(135deg, oklch(0.60 0.17 158 / 0.10), oklch(0.50 0.19 170 / 0.08))"
                      : "linear-gradient(135deg, oklch(0.60 0.18 25 / 0.10), oklch(0.55 0.20 15 / 0.08))",
                    borderColor: csResult.netProfitTwd >= 0 ? "oklch(0.60 0.17 158 / 0.25)" : "oklch(0.60 0.18 25 / 0.25)",
                    border: "1px solid"
                  }}>
                    <p className="text-xs text-muted-foreground mb-1">淨利（總營收 − 購買成本 − 加工費 − 機票費）</p>
                    <div className="flex items-baseline gap-3">
                      <span className="text-3xl font-bold" style={{ color: csResult.netProfitTwd >= 0 ? "oklch(0.45 0.17 158)" : "oklch(0.55 0.22 25)" }}>
                        NT${csResult.netProfitTwd.toLocaleString("zh-TW", { maximumFractionDigits: 0 })}
                      </span>
                      <span className="text-sm text-muted-foreground">≈ ${csResult.netProfitUsd.toFixed(2)} USD</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">ROI: {csResult.roi.toFixed(2)}%</p>
                  </div>

                  {/* 分配表 */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* 通道方 */}
                    <div className="rounded-xl p-4 border" style={{
                      background: "linear-gradient(135deg, oklch(0.55 0.20 45 / 0.08), oklch(0.48 0.18 35 / 0.06))",
                      borderColor: "oklch(0.55 0.20 45 / 0.30)"
                    }}>
                      <p className="text-xs font-medium mb-2" style={{ color: "oklch(0.50 0.20 45)" }}>通道方應收</p>
                      <p className="text-xl font-bold" style={{ color: "oklch(0.45 0.20 45)" }}>
                        NT${csResult.channelTotalTwd.toLocaleString("zh-TW", { maximumFractionDigits: 0 })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">≈ ${csResult.channelTotalUsd.toFixed(2)} USD</p>
                      <div className="mt-2 pt-2 border-t border-border/40 space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>通道費</span>
                          <span>NT${csResult.channelFeeTwd.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>淨利 {csResult.channelSharePct}%</span>
                          <span>NT${csResult.channelShareTwd.toLocaleString("zh-TW", { maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>
                    </div>

                    {/* 客戶應得 */}
                    <div className="rounded-xl p-4 border" style={{
                      background: "linear-gradient(135deg, oklch(0.60 0.17 158 / 0.08), oklch(0.50 0.19 170 / 0.06))",
                      borderColor: "oklch(0.60 0.17 158 / 0.25)"
                    }}>
                      <p className="text-xs font-medium mb-2" style={{ color: "oklch(0.50 0.17 158)" }}>回給客戶</p>
                      <p className="text-xl font-bold" style={{ color: "oklch(0.45 0.17 158)" }}>
                        NT${csResult.customerShareTwd.toLocaleString("zh-TW", { maximumFractionDigits: 0 })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">≈ ${csResult.customerShareUsd.toFixed(2)} USD</p>
                      <div className="mt-2 pt-2 border-t border-border/40 space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>淨利 {(100 - csResult.channelSharePct)}%</span>
                          <span>NT${(csResult.netProfitTwd * (1 - csResult.channelSharePct / 100)).toLocaleString("zh-TW", { maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className="flex justify-between text-xs text-rose-500">
                          <span>扣通道費</span>
                          <span>-NT${csResult.channelFeeTwd.toLocaleString("zh-TW", { maximumFractionDigits: 0 })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 詳細明細 */}
                <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
                  <h3 className="text-sm font-semibold mb-4">詳細明細</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">總營收</span>
                      <span>${csResult.totalRevenueUsd.toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">購買成本</span>
                      <span>-${csResult.totalCostUsd.toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between text-orange-500">
                      <span>加工費</span>
                      <span>-NT${csResult.processingFeeTwd.toLocaleString("zh-TW", { maximumFractionDigits: 0 })} TWD</span>
                    </div>
                    <div className="flex justify-between text-blue-500">
                      <span>機票費</span>
                      <span>-NT${csResult.ticketTwd.toLocaleString("zh-TW", { maximumFractionDigits: 0 })} TWD</span>
                    </div>
                    <div className="border-t border-border/60 pt-2 flex justify-between font-semibold">
                      <span>淨利</span>
                      <span style={{ color: csResult.netProfitTwd >= 0 ? "oklch(0.45 0.17 158)" : "oklch(0.55 0.22 25)" }}>
                        NT${csResult.netProfitTwd.toLocaleString("zh-TW", { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="flex justify-between text-rose-500 text-xs">
                      <span>分配通道費</span>
                      <span>-NT${csResult.channelFeeTwd.toLocaleString("zh-TW", { maximumFractionDigits: 0 })} TWD</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>保本賣價</span>
                      <span>{csResult.breakEvenSellVndWan.toFixed(2)} 萬 VND/錢</span>
                    </div>
                  </div>
                </div>

                {/* 複製結算報告 */}
                <button
                  onClick={() => {
                    const lines = [
                      "通道結算報告",
                      "═══════════════════════════════════",
                      "",
                      "基本信息",
                      `黃金重量: ${csWeightG}克 (${csResult.weightChi.toFixed(2)}錢)`,
                      `香港買價: ${csBuyUsdOz} USD/oz`,
                      `越南賣價: ${csSellVndWan} 萬 VND/錢`,
                      `匯率: ${csRateVndUsd} VND/USD`,
                      `USDT/TWD: ${usdTwdRate}`,
                      "",
                      "開銷明細",
                      `  ⚙️ 加工費: NT$${csProcessingFeeTwd.toFixed(0)} TWD`,
                      `  ✈️ 機票費: NT$${parseFloat(csTicketTwd)||0} TWD`,
                      `  🔒 通道費: NT$${parseFloat(csChannelFeeTwd)||0} TWD（分配時扣）`,
                      "",
                      "結算明細",
                      `總營收: $${csResult.totalRevenueUsd.toFixed(2)} USD`,
                      `購買成本: $${csResult.totalCostUsd.toFixed(2)} USD`,
                      `加工費: -NT$${csResult.processingFeeTwd.toLocaleString("zh-TW", { maximumFractionDigits: 0 })} TWD`,
                      `機票費: -NT$${csResult.ticketTwd.toLocaleString("zh-TW", { maximumFractionDigits: 0 })} TWD`,
                      `淨利: NT$${csResult.netProfitTwd.toLocaleString("zh-TW", { maximumFractionDigits: 0 })} (≈ $${csResult.netProfitUsd.toFixed(2)} USD)`,
                      `ROI: ${csResult.roi.toFixed(2)}%`,
                      "",
                      "分配結果",
                      `通道方應收: NT$${csResult.channelTotalTwd.toLocaleString("zh-TW", { maximumFractionDigits: 0 })} (通道費 NT$${csResult.channelFeeTwd} + 淨利${csResult.channelSharePct}% NT$${csResult.channelShareTwd.toLocaleString("zh-TW", { maximumFractionDigits: 0 })})`,
                      `回給客戶: NT$${csResult.customerShareTwd.toLocaleString("zh-TW", { maximumFractionDigits: 0 })} (淨利${100-csResult.channelSharePct}% - 通道費 NT$${csResult.channelFeeTwd})`,
                      `保本賣價: ${csResult.breakEvenSellVndWan.toFixed(2)} 萬 VND/錢`,
                      "",
                      `計算時間: ${new Date().toLocaleString("zh-TW")}`,
                      "═══════════════════════════════════",
                    ];
                    navigator.clipboard.writeText(lines.join("\n")).then(() => {
                      toast.success("結算報告已複製到剪貼簿！");
                    }).catch(() => {
                      window.prompt("複製以下報告：", lines.join("\n"));
                    });
                  }}
                  className="w-full py-3 rounded-xl border border-border text-sm font-medium flex items-center justify-center gap-2 hover:bg-secondary transition-colors"
                >
                  <Copy className="w-4 h-4" />複製結算報告
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
