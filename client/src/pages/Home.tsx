import { useState, useCallback, useMemo, useEffect } from "react";
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
  Zap,
  ChevronDown,
  ChevronUp,
  Plane,
  Hotel,
  UtensilsCrossed,
  Car,
  Lock,
  ListOrdered,
  Plus,
  Minus,
  FileText,
  Copy,
  UserCheck,
} from "lucide-react";

const WEIGHT_PRESETS = [200, 280, 300];
const G_PER_OZ = 31.1035;
const G_PER_CHI = 3.75;

interface ExpenseBreakdown {
  ticket: number;
  hotel: number;
  meal: number;
  transport: number;
  channel: number;
}

interface CalcResult {
  totalCostUsd: number;
  totalRevenueUsd: number;
  netProfitUsd: number;
  roi: number;
  weightOz: number;
  weightChi: number;
  totalExpenseUsd: number;
  expenseBreakdown: ExpenseBreakdown;
  referralPct: number;
  referralBaseProfit: number;  // 介紹費基準（只扣機票+通道費）
  referralFee: number;
  actualNetProfit: number;
  actualRoi: number;
  breakEvenSellVndWan: number;
}

const defaultExpenses: ExpenseBreakdown = {
  ticket: 0,
  hotel: 0,
  meal: 0,
  transport: 0,
  channel: 0,
};

const expenseFields: {
  key: keyof ExpenseBreakdown;
  icon: React.ReactNode;
  color: string;
}[] = [
  { key: "ticket",    icon: <Plane className="w-3.5 h-3.5" />,           color: "text-sky-500" },
  { key: "hotel",     icon: <Hotel className="w-3.5 h-3.5" />,           color: "text-violet-500" },
  { key: "meal",      icon: <UtensilsCrossed className="w-3.5 h-3.5" />, color: "text-orange-500" },
  { key: "transport", icon: <Car className="w-3.5 h-3.5" />,             color: "text-blue-500" },
  { key: "channel",   icon: <Lock className="w-3.5 h-3.5" />,            color: "text-rose-500" },
];

export default function Home() {
  const [lang, setLang] = useState<Lang>("zh");
  const [weightG, setWeightG] = useState("300");
  const [buyUsdOz, setBuyUsdOz] = useState("");
  const [sellVndWan, setSellVndWan] = useState("");
  const [rateVndUsd, setRateVndUsd] = useState("");
  const [expenses, setExpenses] = useState<ExpenseBreakdown>(defaultExpenses);
  const [showExpenses, setShowExpenses] = useState(true);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [isCalcDone, setIsCalcDone] = useState(false);
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  const [isFetchingGold, setIsFetchingGold] = useState(false);
  // C2C 設定
  const [c2cRank, setC2cRank] = useState(5);      // 第幾順位
  const [c2cOffset, setC2cOffset] = useState(50); // 加減點數
  const [showC2CPanel, setShowC2CPanel] = useState(false);
  // 介紹費百分比（從淨利中扣除）
  const [referralPct, setReferralPct] = useState(0);
  // 介紹人名稱
  const [referralName, setReferralName] = useState("");
  // TWD 換算匯率（用於開銷換算 USD）
  const [usdTwdRate, setUsdTwdRate] = useState(32);

  const sessionId = useMemo(() => getSessionId(), []);
  const utils = trpc.useUtils();

  // 幣安 C2C P2P 匯率查詢
  const {
    data: c2cData,
    refetch: refetchC2C,
    isFetching: isC2CFetching,
  } = trpc.gold.getBinanceC2CRate.useQuery(
    { rank: c2cRank, offset: c2cOffset, rows: 10 },
    { enabled: false, retry: false }
  );

  // 倫敦金現貨價格查詢
  const {
    data: goldSpotData,
    refetch: refetchGoldSpot,
    isFetching: isGoldSpotFetching,
  } = trpc.gold.getGoldSpotPrice.useQuery(
    undefined,
    { enabled: false, retry: false }
  );

  useEffect(() => {
    if (goldSpotData?.price) {
      // 保留兩位小數
      setBuyUsdOz(goldSpotData.price.toFixed(2));
      toast.success(
        `倫敦金 ${goldSpotData.note ?? ''} ${goldSpotData.price.toFixed(2)} USD/oz`
      );
      setIsFetchingGold(false);
    } else if (goldSpotData?.source === 'error') {
      toast.error('倫敦金價格取得失敗，請手動輸入');
      setIsFetchingGold(false);
    }
  }, [goldSpotData]);

  const handleFetchGoldSpot = async () => {
    setIsFetchingGold(true);
    await refetchGoldSpot();
  };

  // 當 C2C 資料更新時自動填入
  useEffect(() => {
    if (c2cData?.finalRate) {
      setRateVndUsd(c2cData.finalRate.toString());
      setShowC2CPanel(true);
      toast.success(
        `報價取得成功：${c2cData.baseRate?.toLocaleString()} + ${c2cData.offset} → ${c2cData.finalRate.toLocaleString()}`
      );
      setIsFetchingRate(false);
    } else if (c2cData?.source === "error") {
      toast.error("報價取得失敗，請手動輸入匯率");
      setIsFetchingRate(false);
    }
  }, [c2cData]);

  // BitoEX USDT/TWD 匯率查詢（自動啟動）
  const {
    data: bitoData,
    refetch: refetchBito,
    isFetching: isBitoFetching,
  } = trpc.gold.getBitoUsdtTwd.useQuery(
    undefined,
    { enabled: true, retry: false, staleTime: 60000 }
  );

  // 當 BitoEX 資料更新時，同步更新 usdTwdRate
  useEffect(() => {
    if (bitoData?.adjustedRate && bitoData.adjustedRate > 0) {
      // 四捨五入到整數
      setUsdTwdRate(Math.round(bitoData.adjustedRate));
    }
  }, [bitoData]);

  // 每台錢台幣價格：金價(USD/oz) × USDT/TWD ÷ 8.294
  const TAEL_PER_OZ = G_PER_OZ / G_PER_CHI; // 8.2943
  const pricePerChiTwd = useMemo(() => {
    const buy = parseFloat(buyUsdOz);
    if (!buy || !usdTwdRate) return null;
    return buy * usdTwdRate / TAEL_PER_OZ;
  }, [buyUsdOz, usdTwdRate]);

  // 越南賣出換算台幣：每台錢越南賣價 × 10000 ÷ (VND/USD ÷ USDT/TWD)
  // 即 sellVndWan × 10000 × USDT/TWD ÷ rateVndUsd
  const sellPerChiTwd = useMemo(() => {
    const sell = parseFloat(sellVndWan);
    const rate = parseFloat(rateVndUsd);
    if (!sell || !rate || !usdTwdRate) return null;
    // VND/TWD = rateVndUsd / usdTwdRate
    const vndPerTwd = rate / usdTwdRate;
    return (sell * 10000) / vndPerTwd;
  }, [sellVndWan, rateVndUsd, usdTwdRate]);

  // 每台錢買賣台幣利差
  const chiTwdSpread = useMemo(() => {
    if (pricePerChiTwd === null || sellPerChiTwd === null) return null;
    return sellPerChiTwd - pricePerChiTwd;
  }, [pricePerChiTwd, sellPerChiTwd]);

  // 備用：一般匯率查詢
  const { data: rateData, refetch: refetchRate } = trpc.gold.getExchangeRate.useQuery(
    undefined,
    { enabled: false, retry: false }
  );

  useEffect(() => {
    if (rateData?.rate) {
      setRateVndUsd(Math.round(rateData.rate).toString());
      toast.success(t(lang, "autoRateSuccess") + ` (${Math.round(rateData.rate).toLocaleString()})`);
      setIsFetchingRate(false);
    } else if (rateData?.rate === null) {
      toast.error(t(lang, "autoRateError"));
      setIsFetchingRate(false);
    }
  }, [rateData, lang]);

  const handleAutoRate = async () => {
    setIsFetchingRate(true);
    await refetchC2C();
  };

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
      toast.success(
        lang === "zh" ? "歷史記錄已清除" :
        lang === "en" ? "History cleared" : "Đã xóa lịch sử"
      );
    },
  });

  const { data: history = [] } = trpc.gold.getHistory.useQuery(
    { sessionId },
    { refetchOnWindowFocus: false }
  );

  // 開銷合計（TWD）
  const totalExpenseTwd = Object.values(expenses).reduce((a, b) => a + b, 0);
  // 開銷合計（USD 換算）
  const totalExpenseUsdCalc = usdTwdRate > 0 ? totalExpenseTwd / usdTwdRate : 0;

  const handleExpenseChange = (key: keyof ExpenseBreakdown, val: string) => {
    setExpenses(prev => ({ ...prev, [key]: parseFloat(val) || 0 }));
  };

  const handleCalculate = useCallback(() => {
    const buy = parseFloat(buyUsdOz);
    const sell = parseFloat(sellVndWan);
    const rate = parseFloat(rateVndUsd);
    const weight = parseFloat(weightG);

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
      expenseUsd: 0,
      expenses: {
        ...expenses,
        currency: 'twd' as const,
        usdTwdRate,
      },
      referralPct,
      sessionId,
      roiAlertThreshold: 2,
    });
  }, [buyUsdOz, sellVndWan, rateVndUsd, weightG, expenses, referralPct, sessionId, lang, calcMutation, usdTwdRate]);

  const handleReset = () => {
    setBuyUsdOz("");
    setSellVndWan("");
    setRateVndUsd("");
    setWeightG("300");
    setExpenses(defaultExpenses);
    setResult(null);
    setIsCalcDone(false);
  };

  const isProfit = result && result.actualNetProfit > 0;

  // 一鍵生成報告
  const handleGenerateReport = () => {
    if (!result) return;
    const now = new Date().toLocaleString(lang === "zh" ? "zh-TW" : lang === "vi" ? "vi-VN" : "en-US");
    const lines = [
      "黃金跨境套利計算報告",
      "═══════════════════════════════════",
      "",
      "基本信息",
      `黃金重量: ${weightG}克 (${result.weightChi.toFixed(2)}錢)`,
      `香港買價: ${buyUsdOz} USD/oz`,
      `越南賣價: ${sellVndWan} 萬VND/錢`,
      `匯率: ${rateVndUsd} VND/USD`,
      "",
      "財務分析",
      `總營收: $${result.totalRevenueUsd.toFixed(2)} USD`,
      `購買成本: $${result.totalCostUsd.toFixed(2)} USD`,
      `開銷總計: $${result.totalExpenseUsd.toFixed(2)} USD`,
      ...(result.expenseBreakdown.ticket ? [`  ✈️ 機票: $${result.expenseBreakdown.ticket} USD`] : []),
      ...(result.expenseBreakdown.hotel ? [`  🏨 住宿: $${result.expenseBreakdown.hotel} USD`] : []),
      ...(result.expenseBreakdown.meal ? [`  🍜 餐飲: $${result.expenseBreakdown.meal} USD`] : []),
      ...(result.expenseBreakdown.transport ? [`  🚗 交通: $${result.expenseBreakdown.transport} USD`] : []),
      ...(result.expenseBreakdown.channel ? [`  🔒 通道費: $${result.expenseBreakdown.channel} USD`] : []),
      "",
      "利潤計算",
      `毛利: $${(result.totalRevenueUsd - result.totalCostUsd).toFixed(2)} USD`,
      `淨利: $${result.netProfitUsd.toFixed(2)} USD`,
      ...(referralPct > 0 ? [
        `介紹費基準 (淨利只扣機票+通道費): $${result.referralBaseProfit.toFixed(2)} USD`,
        `介紹費 (${referralName ? referralName + " " : ""}${referralPct}%): $${result.referralFee.toFixed(2)} USD`,
        `實際淨利: $${result.actualNetProfit.toFixed(2)} USD`,
      ] : []),
      ...(referralName && referralPct === 0 ? [`介紹人: ${referralName}`] : []),
      `保本賣價: ${result.breakEvenSellVndWan.toFixed(2)} 萬VND/錢`,
      `ROI: ${result.actualRoi.toFixed(2)}%`,
      "",
      "計算時間",
      now,
      "═══════════════════════════════════",
    ];
    const report = lines.join("\n");
    navigator.clipboard.writeText(report).then(() => {
      toast.success(lang === "zh" ? "報告已複製到剪貼簿！" : lang === "en" ? "Report copied!" : "Đã sao chép báo cáo!");
    }).catch(() => {
      // fallback: show in alert
      window.prompt("複製以下報告：", report);
    });
  };
  const weightOzPreview = parseFloat(weightG) ? (parseFloat(weightG) / G_PER_OZ).toFixed(4) : "—";
  const weightChiPreview = parseFloat(weightG) ? (parseFloat(weightG) / G_PER_CHI).toFixed(2) : "—";
  const vndPreview = parseFloat(sellVndWan) ? `${(parseFloat(sellVndWan) * 10000).toLocaleString()} VND` : "—";

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Decorative geometric blobs - green palette */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full geo-blob-blue opacity-70" />
        <div className="absolute top-1/2 -left-56 w-96 h-96 rounded-full geo-blob-pink opacity-60" />
        <div className="absolute bottom-0 right-1/3 w-72 h-72 rounded-full geo-blob-gold opacity-50" />
        <svg className="absolute top-0 left-0 w-full h-full opacity-[0.035]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="currentColor" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Header with emerald gradient */}
      <header className="relative z-10 border-b border-border/60 bg-card/90 backdrop-blur-sm">
        <div className="container py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, oklch(0.60 0.17 158), oklch(0.50 0.19 170))" }}>
              <Coins className="w-5 h-5 text-white" />
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
                    ? "text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                style={lang === l ? {
                  background: "linear-gradient(135deg, oklch(0.60 0.17 158), oklch(0.50 0.19 170))"
                } : {}}
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
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium"
            style={{
              background: "linear-gradient(135deg, oklch(0.60 0.17 158 / 0.08), oklch(0.50 0.19 170 / 0.06))",
              borderColor: "oklch(0.60 0.17 158 / 0.25)",
              color: "oklch(0.45 0.17 158)"
            }}>
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
                <Calculator className="w-4.5 h-4.5" style={{ color: "oklch(0.55 0.17 158)" }} />
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
                            ? "text-white border-transparent"
                            : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                        }`}
                        style={weightG === String(w) ? {
                          background: "linear-gradient(135deg, oklch(0.60 0.17 158), oklch(0.50 0.19 170))"
                        } : {}}
                      >
                        {w}g
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setWeightG(v => String(Math.max(0, (parseFloat(v) || 0) - 1)))
                      }
                      className="w-10 h-10 rounded-lg border border-border flex items-center justify-center hover:bg-secondary transition-colors flex-shrink-0 text-muted-foreground hover:text-foreground"
                      title="-1g"
                    ><Minus className="w-3.5 h-3.5" /></button>
                    <Input
                      type="number"
                      value={weightG}
                      onChange={(e) => setWeightG(e.target.value)}
                      placeholder={t(lang, "weightPlaceholder")}
                      className="bg-input border-border flex-1"
                    />
                    <button
                      onClick={() => setWeightG(v => String((parseFloat(v) || 0) + 1))}
                      className="w-10 h-10 rounded-lg border border-border flex items-center justify-center hover:bg-secondary transition-colors flex-shrink-0 text-muted-foreground hover:text-foreground"
                      title="+1g"
                    ><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                  {parseFloat(weightG) > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ≈ {weightOzPreview} oz &nbsp;·&nbsp; {weightChiPreview} {t(lang, "chiUnit")}
                    </p>
                  )}
                </div>

                {/* Buy price */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      {t(lang, "buyPrice")}
                    </Label>
                    <button
                      onClick={handleFetchGoldSpot}
                      disabled={isFetchingGold || isGoldSpotFetching}
                      className="flex items-center gap-1 text-xs font-medium transition-colors disabled:opacity-50"
                      style={{ color: "oklch(0.55 0.17 158)" }}
                    >
                      {(isFetchingGold || isGoldSpotFetching)
                        ? <><RefreshCw className="w-3 h-3 animate-spin" />取得中...</>
                        : <><Coins className="w-3 h-3" />倫敦金現貨</>}
                    </button>
                  </div>
                  <Input
                    type="number"
                    value={buyUsdOz}
                    onChange={(e) => setBuyUsdOz(e.target.value)}
                    placeholder={t(lang, "buyPricePlaceholder")}
                    className="bg-input border-border"
                  />
                  {goldSpotData?.price && goldSpotData.source !== 'error' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      來源: {goldSpotData.note} &nbsp;· 
                      <span style={{ color: "oklch(0.45 0.17 158)" }}>{goldSpotData.price.toFixed(2)} USD/oz</span>
                    </p>
                  )}
                  {/* 每台錢台幣價格 */}
                  {pricePerChiTwd !== null && (
                    <div className="mt-2 flex items-center justify-between px-3 py-2 rounded-lg"
                      style={{ background: "oklch(0.60 0.17 158 / 0.08)", border: "1px solid oklch(0.60 0.17 158 / 0.2)" }}>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: "oklch(0.40 0.18 158)" }}>
                          {t(lang, "pricePerChiTwd")}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {t(lang, "pricePerChiTwdHint")}
                        </p>
                      </div>
                      <div className="text-right">
                        {isBitoFetching ? (
                          <p className="text-xs text-muted-foreground">{t(lang, "fetchingUsdtTwd")}</p>
                        ) : (
                          <>
                            <p className="text-lg font-black" style={{ color: "oklch(0.40 0.18 158)" }}>
                              NT${Math.round(pricePerChiTwd).toLocaleString()}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {t(lang, "usdtTwdRate")}: {usdTwdRate}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Sell price */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    {t(lang, "sellPrice")}
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSellVndWan(v => String(Math.max(0, (parseFloat(v) || 0) - 1)))}
                      className="w-8 h-10 rounded-lg border border-border flex items-center justify-center hover:bg-secondary transition-colors flex-shrink-0"
                      title="-1 萬 VND"
                    ><Minus className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    <Input
                      type="number"
                      value={sellVndWan}
                      onChange={(e) => setSellVndWan(e.target.value)}
                      placeholder={t(lang, "sellPricePlaceholder")}
                      className="bg-input border-border flex-1"
                    />
                    <button
                      onClick={() => setSellVndWan(v => String((parseFloat(v) || 0) + 1))}
                      className="w-8 h-10 rounded-lg border border-border flex items-center justify-center hover:bg-secondary transition-colors flex-shrink-0"
                      title="+1 萬 VND"
                    ><Plus className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  </div>
                  {parseFloat(sellVndWan) > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t(lang, "currentRate")}: {vndPreview}/{t(lang, "chiUnit")}
                    </p>
                  )}
                  {/* 越南賣價下方：賣出台幣金額 + 買賣利差 */}
                  {sellPerChiTwd !== null && (
                    <div className="mt-2 rounded-lg overflow-hidden"
                      style={{ border: "1px solid oklch(0.60 0.17 158 / 0.2)" }}>
                      {/* 賣出台幣行 */}
                      <div className="flex items-center justify-between px-3 py-2"
                        style={{ background: "oklch(0.55 0.19 170 / 0.08)" }}>
                        <div>
                          <p className="text-xs font-semibold" style={{ color: "oklch(0.35 0.18 170)" }}>
                            {lang === "zh" ? "賣出每台錢台幣" : lang === "en" ? "Sell per Chi (TWD)" : "Bán mỗi chỉ (TWD)"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {lang === "zh" ? "VND賣價 × 10000 ÷ VND/TWD" : lang === "en" ? "VND × 10000 ÷ VND/TWD" : "VND × 10000 ÷ VND/TWD"}
                          </p>
                        </div>
                        <p className="text-lg font-black" style={{ color: "oklch(0.35 0.18 170)" }}>
                          NT${Math.round(sellPerChiTwd).toLocaleString()}
                        </p>
                      </div>
                      {/* 買賣利差行 */}
                      {chiTwdSpread !== null && pricePerChiTwd !== null && (
                        <div className="flex items-center justify-between px-3 py-1.5"
                          style={{ background: chiTwdSpread >= 0 ? "oklch(0.60 0.17 158 / 0.06)" : "oklch(0.55 0.2 25 / 0.06)" }}>
                          <p className="text-[10px] font-medium text-muted-foreground">
                            {lang === "zh" ? "每錢利差（賣出 − 買入）" : lang === "en" ? "Spread per chi" : "ChênhLệch/chỉ"}
                          </p>
                          <p className="text-sm font-black"
                            style={{ color: chiTwdSpread >= 0 ? "oklch(0.40 0.18 158)" : "oklch(0.45 0.2 25)" }}>
                            {chiTwdSpread >= 0 ? "+" : ""}NT${Math.round(chiTwdSpread).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Exchange rate with quick fetch */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      {t(lang, "exchangeRate")}
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleAutoRate}
                        disabled={isFetchingRate || isC2CFetching}
                        className="flex items-center gap-1 text-xs font-medium transition-colors disabled:opacity-50"
                        style={{ color: "oklch(0.55 0.17 158)" }}
                        title="參考匯率基於市場行情，實際以換匯為準"
                      >
                        {(isFetchingRate || isC2CFetching)
                          ? <><RefreshCw className="w-3 h-3 animate-spin" />取得中...</>
                          : <><Zap className="w-3 h-3" />取得參考匯率</>}
                      </button>
                      <span
                        className="w-4 h-4 rounded-full border border-muted-foreground/40 flex items-center justify-center text-[10px] text-muted-foreground cursor-help flex-shrink-0"
                        title="參考匯率基於市場行情，實際以換匯為準"
                      >?</span>
                    </div>
                  </div>
                  <Input
                    type="number"
                    value={rateVndUsd}
                    onChange={(e) => setRateVndUsd(e.target.value)}
                    placeholder={t(lang, "ratePlaceholder")}
                    className="bg-input border-border"
                  />
                </div>

                {/* Referral fee input */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <UserCheck className="w-3.5 h-3.5" style={{ color: "oklch(0.55 0.17 158)" }} />
                    <Label className="text-xs font-medium text-muted-foreground">
                      {lang === "zh" ? "介紹費" : lang === "en" ? "Referral Fee" : "Phí giới thiệu"}
                    </Label>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                    <Input
                      type="text"
                      value={referralName}
                      onChange={(e) => setReferralName(e.target.value)}
                      placeholder={lang === "zh" ? "介紹人（選填）" : lang === "en" ? "Referrer name" : "Tên người giới thiệu"}
                      className="bg-input border-border text-xs"
                    />
                    <Input
                      type="number"
                      value={referralPct || ""}
                      onChange={(e) => setReferralPct(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                      placeholder="0"
                      className="bg-input border-border w-16 text-center"
                      min={0}
                      max={100}
                    />
                    <span className="text-sm text-muted-foreground font-medium">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {lang === "zh" ? "從淨利中扣除，不計入開銷" : lang === "en" ? "Deducted from net profit" : "Trừ từ lợi nhuận ròng"}
                  </p>
                </div>

                  {/* Expense breakdown section */}
                <div className="rounded-xl border border-border overflow-hidden">
                  <button
                    onClick={() => setShowExpenses(!showExpenses)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-secondary hover:bg-secondary/80 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">{t(lang, "expenseSection")}</span>
                      {totalExpenseTwd > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium text-white"
                          style={{ background: "oklch(0.55 0.17 158)" }}>
                          NT${totalExpenseTwd.toFixed(0)}
                        </span>
                      )}
                    </div>
                    {showExpenses
                      ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                      : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    }
                  </button>

                  {showExpenses && (
                    <div className="p-4 space-y-3 bg-card">
                      {/* TWD 輸入提示 */}
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-sky-400"></span>
                        {t(lang, "expenseCurrencyHint")}
                        {usdTwdRate > 0 && (
                          <span className="ml-1 opacity-70">({t(lang, "usdtTwdRate")}: {usdTwdRate})</span>
                        )}
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {expenseFields.map(({ key, icon, color }) => (
                          <div key={key}>
                            <Label className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                              <span className={color}>{icon}</span>
                              {t(lang, `expense${key.charAt(0).toUpperCase() + key.slice(1)}` as keyof typeof translations.zh)}
                              <span className="text-[10px] opacity-60">TWD</span>
                            </Label>
                            <Input
                              type="number"
                              value={expenses[key] || ""}
                              onChange={(e) => handleExpenseChange(key, e.target.value)}
                              placeholder="0"
                              className="bg-input border-border h-8 text-sm"
                            />
                          </div>
                        ))}
                      </div>

                      {/* Total expense display */}
                      <div className="flex items-center justify-between pt-2 border-t border-border">
                        <span className="text-xs font-medium text-muted-foreground">{t(lang, "expenseTwdTotal")}</span>
                        <div className="text-right">
                          <span className="text-sm font-bold" style={{ color: "oklch(0.45 0.17 158)" }}>
                            NT${totalExpenseTwd.toFixed(0)}
                          </span>
                          {usdTwdRate > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {t(lang, "expenseUsdEquiv")} ${totalExpenseUsdCalc.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-6">
                <Button
                  onClick={handleCalculate}
                  disabled={calcMutation.isPending}
                  className="flex-1 text-white font-semibold rounded-xl h-11 border-0"
                  style={{
                    background: calcMutation.isPending
                      ? "oklch(0.75 0.1 158)"
                      : "linear-gradient(135deg, oklch(0.60 0.17 158), oklch(0.50 0.19 170))"
                  }}
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
                  ? "border-emerald-200"
                  : "border-rose-200"
                : "border-border"
            }`}
              style={isCalcDone && result && isProfit ? {
                background: "linear-gradient(135deg, white, oklch(0.97 0.02 158 / 0.5))"
              } : {}}>
              <div className="flex items-center gap-2 mb-5">
                {isCalcDone && result ? (
                  isProfit
                    ? <TrendingUp className="w-4.5 h-4.5 text-emerald-500" />
                    : <TrendingDown className="w-4.5 h-4.5 text-rose-500" />
                ) : (
                  <TrendingUp className="w-4.5 h-4.5" style={{ color: "oklch(0.55 0.17 158)" }} />
                )}
                <h2 className="text-base font-semibold">{t(lang, "results")}</h2>
              </div>

              {!isCalcDone || !result ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                    style={{ background: "oklch(0.60 0.17 158 / 0.08)" }}>
                    <Calculator className="w-7 h-7" style={{ color: "oklch(0.60 0.17 158 / 0.5)" }} />
                  </div>
                  <p className="text-sm text-muted-foreground max-w-xs">{t(lang, "waitingInput")}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Net Profit - Hero */}
                  <div className={`rounded-xl p-5 ${
                    isProfit
                      ? "border border-emerald-100"
                      : "bg-rose-50 border border-rose-100"
                  }`}
                    style={isProfit ? {
                      background: "linear-gradient(135deg, oklch(0.96 0.03 158), oklch(0.94 0.04 165))"
                    } : {}}>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      {referralPct > 0
                        ? (lang === "zh" ? "實際淨利" : lang === "en" ? "Actual Net Profit" : "Lợi nhuận thực")
                        : t(lang, "netProfit")}
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-3xl font-black tracking-tight ${
                        isProfit ? "" : "text-rose-600"
                      }`}
                        style={isProfit ? { color: "oklch(0.40 0.18 158)" } : {}}>
                        {isProfit ? "+" : ""}${result.actualNetProfit.toFixed(2)}
                      </span>
                      <span className="text-sm text-muted-foreground">USD</span>
                    </div>
                    <div className={`inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      isProfit ? "" : "bg-rose-100 text-rose-700"
                    }`}
                      style={isProfit ? {
                        background: "oklch(0.60 0.17 158 / 0.15)",
                        color: "oklch(0.40 0.18 158)"
                      } : {}}>
                      {isProfit ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      ROI {result.actualRoi.toFixed(2)}%
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
                      <p className="text-xs text-muted-foreground mb-1">
                        {lang === "zh" ? "毛利" : lang === "en" ? "Gross Profit" : "Lợi nhuận gộp"}
                      </p>
                      <p className="text-lg font-bold text-foreground">
                        ${(result.totalRevenueUsd - result.totalCostUsd).toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">USD</p>
                    </div>
                    <div className="bg-secondary rounded-xl p-4">
                      <p className="text-xs text-muted-foreground mb-1">
                        {lang === "zh" ? "淨利" : lang === "en" ? "Net Profit" : "Lợi nhuận ròng"}
                      </p>
                      <p className="text-lg font-bold text-foreground">${result.netProfitUsd.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">USD</p>
                    </div>
                    {referralPct > 0 && (
                      <>
                        <div className="bg-secondary rounded-xl p-4">
                          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            {lang === "zh" ? `介紹費 (${referralPct}%)` : lang === "en" ? `Referral (${referralPct}%)` : `Phí GT (${referralPct}%)`}
                          </p>
                          <p className="text-lg font-bold text-rose-500">-${result.referralFee.toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">USD</p>
                          <p className="text-[10px] text-muted-foreground/70 mt-1">
                            {lang === "zh" ? `基準: $${result.referralBaseProfit.toFixed(2)} (淨利只扣機票+通道費)` : lang === "en" ? `Base: $${result.referralBaseProfit.toFixed(2)} (ticket+channel only)` : `Cơ sở: $${result.referralBaseProfit.toFixed(2)}`}
                          </p>
                        </div>
                        <div className="bg-secondary rounded-xl p-4">
                          <p className="text-xs text-muted-foreground mb-1">
                            {lang === "zh" ? "實際淨利" : lang === "en" ? "Actual Net" : "Thực lãi"}
                          </p>
                          <p className={`text-lg font-bold ${result.actualNetProfit > 0 ? "" : "text-rose-600"}`}
                            style={result.actualNetProfit > 0 ? { color: "oklch(0.40 0.18 158)" } : {}}>
                            ${result.actualNetProfit.toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground">USD</p>
                        </div>
                      </>
                    )}
                    <div className="bg-secondary rounded-xl p-4">
                      <p className="text-xs text-muted-foreground mb-1">
                        {lang === "zh" ? "保本賣價" : lang === "en" ? "Break-even" : "Giá hòa vốn"}
                      </p>
                      <p className="text-lg font-bold text-foreground">{result.breakEvenSellVndWan.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">萬VND/錢</p>
                    </div>
                    <div className="bg-secondary rounded-xl p-4">
                      <p className="text-xs text-muted-foreground mb-1">{t(lang, "weightChi")}</p>
                      <p className="text-lg font-bold text-foreground">{result.weightChi.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">{t(lang, "chiUnit")}</p>
                    </div>
                  </div>

                  {/* Expense breakdown summary */}
                  {result.totalExpenseUsd > 0 && (
                    <div className="rounded-xl border border-border p-4 bg-secondary/50">
                      <p className="text-xs font-semibold text-muted-foreground mb-3">{t(lang, "expenseSection")}</p>
                      <div className="grid grid-cols-3 gap-2">
                        {expenseFields.map(({ key, icon, color }) => {
                          const val = result.expenseBreakdown[key];
                          if (!val) return null;
                          return (
                            <div key={key} className="flex items-center gap-1.5">
                              <span className={color}>{icon}</span>
                              <div>
                                <p className="text-xs text-muted-foreground leading-none">
                                  {t(lang, `expense${key.charAt(0).toUpperCase() + key.slice(1)}` as keyof typeof translations.zh)}
                                </p>
                                <p className="text-xs font-semibold text-foreground">${val}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between items-center mt-3 pt-2 border-t border-border">
                        <span className="text-xs text-muted-foreground">{t(lang, "expenseTotal")}</span>
                        <span className="text-sm font-bold" style={{ color: "oklch(0.45 0.17 158)" }}>
                          ${result.totalExpenseUsd.toFixed(2)} USD
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Generate Report Button */}
                  <Button
                    onClick={handleGenerateReport}
                    variant="outline"
                    className="w-full h-10 text-sm font-medium rounded-xl border-border hover:bg-secondary"
                    style={{ borderColor: "oklch(0.60 0.17 158 / 0.4)", color: "oklch(0.45 0.17 158)" }}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    {lang === "zh" ? "一鍵生成報告" : lang === "en" ? "Generate Report" : "Tạo báo cáo"}
                    <Copy className="w-3.5 h-3.5 ml-2 opacity-60" />
                  </Button>

                  {/* High profit alert */}
                  {result.actualRoi > 2 && (
                    <div className="flex items-center gap-2.5 p-3.5 rounded-xl border"
                      style={{
                        background: "oklch(0.60 0.17 158 / 0.06)",
                        borderColor: "oklch(0.60 0.17 158 / 0.25)"
                      }}>
                      <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: "oklch(0.55 0.17 158)" }} />
                      <p className="text-xs font-medium" style={{ color: "oklch(0.45 0.17 158)" }}>
                        {lang === "zh" ? `高利潤套利機會！ROI ${result.actualRoi.toFixed(2)}%，已發送通知。` :
                         lang === "en" ? `High profit opportunity! ROI ${result.actualRoi.toFixed(2)}%. Notification sent.` :
                         `Cơ hội lợi nhuận cao! ROI ${result.actualRoi.toFixed(2)}%. Đã gửi thông báo.`}
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
                  <History className="w-4.5 h-4.5" style={{ color: "oklch(0.55 0.17 158)" }} />
                  <h2 className="text-base font-semibold">{t(lang, "history")}</h2>
                  {history.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium text-white"
                      style={{ background: "oklch(0.60 0.17 158)" }}>
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
                            <span className="text-xs text-muted-foreground">{item.weightG}g</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            ${parseFloat(String(item.buyPriceUsdOz)).toFixed(1)}/oz · {parseFloat(String(item.sellPriceVndWan)).toFixed(0)}萬 · {parseFloat(String(item.rateVndUsd)).toFixed(0)}
                          </div>
                        </div>
                        <div className="text-right ml-3">
                          <p className={`text-sm font-bold ${isPos ? "" : "text-rose-600"}`}
                            style={isPos ? { color: "oklch(0.40 0.18 158)" } : {}}>
                            {isPos ? "+" : ""}${profit.toFixed(2)}
                          </p>
                          <p className={`text-xs font-medium ${isPos ? "" : "text-rose-500"}`}
                            style={isPos ? { color: "oklch(0.55 0.17 158)" } : {}}>
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
            <div className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "oklch(0.60 0.17 158)" }} />
            <span className="text-xs text-muted-foreground">Live</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Re-export translations for use in JSX
import { translations } from "@/lib/i18n";
