import { useState, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { getSessionId } from "@/lib/session";
import { t, type Lang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  TrendingUp,
  TrendingDown,
  Calculator,
  History,
  Trash2,
  RefreshCw,
  Globe,
  Coins,
  ArrowRight,
  Sparkles,
} from "lucide-react";

const WEIGHT_PRESETS = [200, 280, 300];
const G_PER_OZ = 31.1035;
const G_PER_CHI = 3.75;

interface CalcResult {
  totalCostUsd: number;
  totalRevenueUsd: number;
  netProfitUsd: number;
  roi: number;
  weightOz: number;
  weightChi: number;
}

export default function Home() {
  const [lang, setLang] = useState<Lang>("zh");
  const [weightG, setWeightG] = useState("300");
  const [buyUsdOz, setBuyUsdOz] = useState("");
  const [sellVndWan, setSellVndWan] = useState("");
  const [rateVndUsd, setRateVndUsd] = useState("");
  const [expenseUsd, setExpenseUsd] = useState("200");
  const [result, setResult] = useState<CalcResult | null>(null);
  const [isCalcDone, setIsCalcDone] = useState(false);

  const sessionId = useMemo(() => getSessionId(), []);

  const calcMutation = trpc.gold.calculate.useMutation({
    onSuccess: (data) => {
      setResult(data as CalcResult);
      setIsCalcDone(true);
      utils.gold.getHistory.invalidate({ sessionId });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const clearMutation = trpc.gold.clearHistory.useMutation({
    onSuccess: () => {
      utils.gold.getHistory.invalidate({ sessionId });
      toast.success(lang === "zh" ? "歷史記錄已清除" : lang === "en" ? "History cleared" : "Đã xóa lịch sử");
    },
  });

  const utils = trpc.useUtils();

  const { data: history = [] } = trpc.gold.getHistory.useQuery(
    { sessionId },
    { refetchOnWindowFocus: false }
  );

  const handleCalculate = useCallback(() => {
    const buy = parseFloat(buyUsdOz);
    const sell = parseFloat(sellVndWan);
    const rate = parseFloat(rateVndUsd);
    const weight = parseFloat(weightG);
    const expense = parseFloat(expenseUsd) || 0;

    if (!buy || !sell || !rate || !weight) {
      toast.error(
        lang === "zh" ? "請填寫所有必填欄位" :
        lang === "en" ? "Please fill in all required fields" :
        "Vui lòng điền đầy đủ thông tin"
      );
      return;
    }

    calcMutation.mutate({
      buyUsdOz: buy,
      sellVndWan: sell,
      rateVndUsd: rate,
      weightG: weight,
      expenseUsd: expense,
      sessionId,
      roiAlertThreshold: 2,
    });
  }, [buyUsdOz, sellVndWan, rateVndUsd, weightG, expenseUsd, sessionId, lang, calcMutation]);

  const handleReset = () => {
    setBuyUsdOz("");
    setSellVndWan("");
    setRateVndUsd("");
    setWeightG("300");
    setExpenseUsd("200");
    setResult(null);
    setIsCalcDone(false);
  };

  const isProfit = result && result.netProfitUsd > 0;
  const weightOzPreview = parseFloat(weightG) ? (parseFloat(weightG) / G_PER_OZ).toFixed(4) : "—";
  const weightChiPreview = parseFloat(weightG) ? (parseFloat(weightG) / G_PER_CHI).toFixed(2) : "—";
  const vndPreview = parseFloat(sellVndWan) ? `${(parseFloat(sellVndWan) * 10000).toLocaleString()} VND` : "—";

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Decorative geometric blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full geo-blob-blue opacity-60" />
        <div className="absolute top-1/2 -left-48 w-80 h-80 rounded-full geo-blob-pink opacity-50" />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 rounded-full geo-blob-gold opacity-40" />
        {/* Thin geometric lines */}
        <svg className="absolute top-0 left-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="currentColor" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-border/60 bg-card/80 backdrop-blur-sm">
        <div className="container py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Coins className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground leading-none">
                {t(lang, "appTitle")}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                {t(lang, "appSubtitle")}
              </p>
            </div>
          </div>

          {/* Language switcher */}
          <div className="flex items-center gap-1.5 bg-secondary rounded-xl p-1">
            <Globe className="w-3.5 h-3.5 text-muted-foreground ml-1.5" />
            {(["zh", "en", "vi"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  lang === l
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(lang, l === "zh" ? "langZh" : l === "en" ? "langEn" : "langVi")}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 container py-8">
        {/* Route badge */}
        <div className="flex items-center gap-2 mb-8">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/8 border border-primary/20 text-sm font-medium text-primary">
            <Sparkles className="w-3.5 h-3.5" />
            HK
            <ArrowRight className="w-3.5 h-3.5" />
            VN
          </span>
          <span className="text-sm text-muted-foreground">
            {lang === "zh" ? "香港買入 → 越南賣出" : lang === "en" ? "Buy in HK → Sell in VN" : "Mua tại HK → Bán tại VN"}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: Input Panel */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
              <div className="flex items-center gap-2 mb-5">
                <Calculator className="w-4.5 h-4.5 text-primary" />
                <h2 className="text-base font-semibold">{t(lang, "calcParams")}</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-5">{t(lang, "enterDetails")}</p>

              <div className="space-y-4">
                {/* Weight */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    {t(lang, "goldWeight")}
                  </Label>
                  <div className="flex gap-2 mb-2">
                    {WEIGHT_PRESETS.map((w) => (
                      <button
                        key={w}
                        onClick={() => setWeightG(String(w))}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                          weightG === String(w)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-secondary border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        {w}g
                      </button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    value={weightG}
                    onChange={(e) => setWeightG(e.target.value)}
                    placeholder={t(lang, "weightPlaceholder")}
                    className="bg-input border-border focus:ring-primary"
                  />
                  {parseFloat(weightG) > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ≈ {weightOzPreview} oz &nbsp;·&nbsp; {weightChiPreview} {t(lang, "chiUnit")}
                    </p>
                  )}
                </div>

                {/* Buy price */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    {t(lang, "buyPrice")}
                  </Label>
                  <Input
                    type="number"
                    value={buyUsdOz}
                    onChange={(e) => setBuyUsdOz(e.target.value)}
                    placeholder={t(lang, "buyPricePlaceholder")}
                    className="bg-input border-border"
                  />
                </div>

                {/* Sell price */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    {t(lang, "sellPrice")}
                  </Label>
                  <Input
                    type="number"
                    value={sellVndWan}
                    onChange={(e) => setSellVndWan(e.target.value)}
                    placeholder={t(lang, "sellPricePlaceholder")}
                    className="bg-input border-border"
                  />
                  {parseFloat(sellVndWan) > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t(lang, "currentRate")}: {vndPreview}/{t(lang, "chiUnit")}
                    </p>
                  )}
                </div>

                {/* Exchange rate */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    {t(lang, "exchangeRate")}
                  </Label>
                  <Input
                    type="number"
                    value={rateVndUsd}
                    onChange={(e) => setRateVndUsd(e.target.value)}
                    placeholder={t(lang, "ratePlaceholder")}
                    className="bg-input border-border"
                  />
                </div>

                {/* Expense */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    {t(lang, "expense")}
                  </Label>
                  <Input
                    type="number"
                    value={expenseUsd}
                    onChange={(e) => setExpenseUsd(e.target.value)}
                    placeholder={t(lang, "expensePlaceholder")}
                    className="bg-input border-border"
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-6">
                <Button
                  onClick={handleCalculate}
                  disabled={calcMutation.isPending}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl h-11"
                >
                  {calcMutation.isPending ? (
                    <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />{t(lang, "calculating")}</>
                  ) : (
                    <><Calculator className="w-4 h-4 mr-2" />{t(lang, "calculate")}</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="rounded-xl h-11 px-4 border-border hover:bg-secondary"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Right: Results + History */}
          <div className="lg:col-span-3 space-y-4">
            {/* Results Panel */}
            <div className={`bg-card rounded-2xl border shadow-sm p-6 transition-all duration-300 ${
              isCalcDone && result
                ? isProfit
                  ? "border-emerald-200 bg-gradient-to-br from-card to-emerald-50/30"
                  : "border-rose-200 bg-gradient-to-br from-card to-rose-50/30"
                : "border-border"
            }`}>
              <div className="flex items-center gap-2 mb-5">
                {isCalcDone && result ? (
                  isProfit
                    ? <TrendingUp className="w-4.5 h-4.5 text-emerald-500" />
                    : <TrendingDown className="w-4.5 h-4.5 text-rose-500" />
                ) : (
                  <TrendingUp className="w-4.5 h-4.5 text-primary" />
                )}
                <h2 className="text-base font-semibold">{t(lang, "results")}</h2>
              </div>

              {!isCalcDone || !result ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-primary/8 flex items-center justify-center mb-4">
                    <Calculator className="w-7 h-7 text-primary/50" />
                  </div>
                  <p className="text-sm text-muted-foreground max-w-xs">{t(lang, "waitingInput")}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Net Profit - Hero */}
                  <div className={`rounded-xl p-5 ${
                    isProfit
                      ? "bg-emerald-50 border border-emerald-100"
                      : "bg-rose-50 border border-rose-100"
                  }`}>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{t(lang, "netProfit")}</p>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-3xl font-black tracking-tight ${
                        isProfit ? "text-emerald-600" : "text-rose-600"
                      }`}>
                        {isProfit ? "+" : ""}${result.netProfitUsd.toFixed(2)}
                      </span>
                      <span className="text-sm text-muted-foreground">USD</span>
                    </div>
                    <div className={`inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      isProfit
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-700"
                    }`}>
                      {isProfit ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      ROI {result.roi.toFixed(2)}%
                    </div>
                  </div>

                  {/* Detail grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-secondary rounded-xl p-4">
                      <p className="text-xs text-muted-foreground mb-1">{t(lang, "totalCost")}</p>
                      <p className="text-lg font-bold text-foreground">${result.totalCostUsd.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">USD</p>
                    </div>
                    <div className="bg-secondary rounded-xl p-4">
                      <p className="text-xs text-muted-foreground mb-1">{t(lang, "totalRevenue")}</p>
                      <p className="text-lg font-bold text-foreground">${result.totalRevenueUsd.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">USD</p>
                    </div>
                    <div className="bg-secondary rounded-xl p-4">
                      <p className="text-xs text-muted-foreground mb-1">{t(lang, "weightOz")}</p>
                      <p className="text-lg font-bold text-foreground">{result.weightOz.toFixed(4)}</p>
                      <p className="text-xs text-muted-foreground">oz</p>
                    </div>
                    <div className="bg-secondary rounded-xl p-4">
                      <p className="text-xs text-muted-foreground mb-1">{t(lang, "weightChi")}</p>
                      <p className="text-lg font-bold text-foreground">{result.weightChi.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">{t(lang, "chiUnit")}</p>
                    </div>
                  </div>

                  {/* High profit alert */}
                  {result.roi > 2 && (
                    <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-primary/8 border border-primary/20">
                      <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
                      <p className="text-xs font-medium text-primary">
                        {lang === "zh" ? `高利潤套利機會！ROI ${result.roi.toFixed(2)}%，已發送通知。` :
                         lang === "en" ? `High profit opportunity! ROI ${result.roi.toFixed(2)}%. Notification sent.` :
                         `Cơ hội lợi nhuận cao! ROI ${result.roi.toFixed(2)}%. Đã gửi thông báo.`}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* History Panel */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <History className="w-4.5 h-4.5 text-primary" />
                  <h2 className="text-base font-semibold">{t(lang, "history")}</h2>
                  {history.length > 0 && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                      {history.length}
                    </span>
                  )}
                </div>
                {history.length > 0 && (
                  <button
                    onClick={() => clearMutation.mutate({ sessionId })}
                    disabled={clearMutation.isPending}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t(lang, "clearHistory")}
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <History className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">{t(lang, "noHistory")}</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {history.map((item) => {
                    const profit = parseFloat(String(item.netProfitUsd));
                    const roi = parseFloat(String(item.roi));
                    const isPos = profit > 0;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground">
                              {new Date(item.createdAt).toLocaleString(
                                lang === "zh" ? "zh-TW" : lang === "vi" ? "vi-VN" : "en-US",
                                { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">
                              {item.weightG}g
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            ${parseFloat(String(item.buyPriceUsdOz)).toFixed(1)}/oz · {parseFloat(String(item.sellPriceVndWan)).toFixed(0)}萬 · {parseFloat(String(item.rateVndUsd)).toFixed(0)}
                          </div>
                        </div>
                        <div className="text-right ml-3">
                          <p className={`text-sm font-bold ${isPos ? "text-emerald-600" : "text-rose-600"}`}>
                            {isPos ? "+" : ""}${profit.toFixed(2)}
                          </p>
                          <p className={`text-xs font-medium ${isPos ? "text-emerald-500" : "text-rose-500"}`}>
                            {roi.toFixed(2)}%
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/60 mt-8">
        <div className="container py-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {lang === "zh" ? "黃金套利計算器 · 僅供參考，不構成投資建議" :
             lang === "en" ? "Gold Arbitrage Calculator · For reference only, not investment advice" :
             "Máy tính chênh lệch vàng · Chỉ để tham khảo, không phải lời khuyên đầu tư"}
          </p>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-muted-foreground">Live</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
