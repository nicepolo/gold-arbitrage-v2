# 🥇 Gold Arbitrage Calculator

> 黃金跨境套利即時計算工具（香港 → 越南）

一個完整的黃金套利計算解決方案，包含**網頁版計算器**和 **Telegram 機器人**，採用北歐極簡設計風格，支援中文、英文、越南文三語切換。

---

## ✨ 功能特色

| 功能 | 網頁版 | Telegram 機器人 |
|------|--------|----------------|
| 套利利潤計算 | ✅ | ✅ |
| 即時結果展示 | ✅ | ✅ |
| 快速重量預設 (200g/280g/300g) | ✅ | ✅ |
| 計算歷史記錄 | ✅ | — |
| 多語言支援 (中/英/越) | ✅ | — |
| 高利潤通知 (ROI > 閾值) | ✅ | ✅ |
| 引導式對話輸入 | — | ✅ |

---

## 📐 計算公式

```
重量(oz) = 重量(g) ÷ 31.1035
重量(錢) = 重量(g) ÷ 3.75

總成本(USD) = 重量(oz) × 香港買價(USD/oz)
總營收(USD) = 重量(錢) × 越南賣價(萬VND/錢) × 10000 ÷ 匯率(VND/USD)

淨利潤(USD) = 總營收 - 總成本 - 固定開銷
投資報酬率(%) = 淨利潤 ÷ 總成本 × 100
```

---

## 🚀 快速開始

### 前置需求

- Node.js 22+
- pnpm 10+
- MySQL / TiDB 資料庫
- Python 3.11+（Telegram 機器人）

### 網頁版安裝

```bash
# 安裝依賴
pnpm install

# 設定環境變數（複製並填入）
cp .env.example .env

# 推送資料庫 Schema
pnpm db:push

# 開發模式
pnpm dev

# 生產建置
pnpm build
pnpm start
```

### Telegram 機器人安裝

```bash
cd telegram_bot

# 安裝 Python 依賴
pip install -r requirements.txt

# 設定環境變數
export TELEGRAM_BOT_TOKEN="your_bot_token_here"
export ROI_ALERT_THRESHOLD="2.0"  # 可選，預設 2.0%

# 啟動機器人
python bot.py
```

---

## 🌐 Railway 部署指引

### 方法一：網頁版部署

1. 在 [Railway](https://railway.app) 建立新專案
2. 連接此 GitHub 儲存庫
3. 設定以下環境變數：

```env
DATABASE_URL=mysql://user:pass@host:port/dbname
JWT_SECRET=your_jwt_secret_here
NODE_ENV=production
```

4. Railway 會自動偵測 `railway.json` 並執行 `pnpm build && pnpm start`

### 方法二：Telegram 機器人部署

1. 在 Railway 建立**另一個**服務
2. 設定根目錄為 `telegram_bot/`
3. 設定環境變數：

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
ROI_ALERT_THRESHOLD=2.0
```

4. Railway 會自動使用 `telegram_bot/railway.json` 配置

### 取得 Telegram Bot Token

1. 在 Telegram 搜尋 [@BotFather](https://t.me/BotFather)
2. 發送 `/newbot` 指令
3. 依照指示設定機器人名稱
4. 複製取得的 Token 到環境變數

---

## 📁 專案結構

```
gold_arbitrage_calculator/
├── client/                    # React 前端
│   └── src/
│       ├── pages/Home.tsx     # 主計算器頁面
│       ├── lib/i18n.ts        # 多語言翻譯
│       └── lib/session.ts     # Session 管理
├── server/                    # Express + tRPC 後端
│   ├── routers.ts             # API 路由（計算邏輯）
│   ├── db.ts                  # 資料庫查詢
│   └── gold.calc.test.ts      # 單元測試
├── drizzle/                   # 資料庫 Schema
│   └── schema.ts
├── telegram_bot/              # Telegram 機器人
│   ├── bot.py                 # 機器人主程式
│   ├── requirements.txt       # Python 依賴
│   ├── railway.json           # Railway 部署配置
│   └── nixpacks.toml          # Nixpacks 建置配置
├── railway.json               # 網頁版 Railway 配置
└── README.md
```

---

## 🤖 Telegram 機器人指令

| 指令 | 說明 |
|------|------|
| `/start` | 顯示歡迎訊息與操作選單 |
| `/calc` | 引導式計算（逐步輸入參數） |
| `/quick <買價> <賣價> <匯率> [重量] [開銷]` | 快速計算（單行輸入） |
| `/help` | 顯示完整說明 |
| `/cancel` | 取消當前對話 |

**快速計算範例：**
```
/quick 5298.5 1767 26825 300 200
```

---

## 🧪 執行測試

```bash
pnpm test
```

---

## ⚠️ 免責聲明

本工具僅供參考，計算結果不構成任何投資建議。實際交易涉及市場風險、匯率波動及法規限制，請自行評估風險。

---

## 📄 授權

MIT License
