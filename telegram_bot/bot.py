"""
黃金套利計算 Telegram 機器人
支援：/start, /calc（引導式）, /quick（快速計算）, /help, /cancel
高利潤推播：ROI 超過閾值時主動推送到指定聊天室
"""

import os
import logging
import asyncio
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ConversationHandler,
    CallbackQueryHandler,
    filters,
    ContextTypes,
)

# ── 常數 ──────────────────────────────────────────────────────────────
TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
ROI_ALERT_THRESHOLD = float(os.environ.get("ROI_ALERT_THRESHOLD", "2.0"))
# 高利潤推播目標聊天室 ID（逗號分隔，例如 "-1001234567890,123456789"）
ALERT_CHAT_IDS = [
    cid.strip()
    for cid in os.environ.get("ALERT_CHAT_IDS", "").split(",")
    if cid.strip()
]

G_PER_OZ = 31.1035
G_PER_CHI = 3.75

# ConversationHandler 狀態
(
    ASK_WEIGHT,
    ASK_BUY,
    ASK_SELL,
    ASK_RATE,
    ASK_EXPENSE_TICKET,
    ASK_EXPENSE_HOTEL,
    ASK_EXPENSE_MEAL,
    ASK_EXPENSE_TRANSPORT,
    ASK_EXPENSE_CHANNEL,
    ASK_EXPENSE_REFERRAL,
) = range(10)

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


# ── 核心計算邏輯 ──────────────────────────────────────────────────────
def calc_arbitrage(
    buy_usd_oz: float,
    sell_vnd_wan: float,
    rate_vnd_usd: float,
    weight_g: float,
    expense_usd: float,
) -> dict:
    weight_oz = weight_g / G_PER_OZ
    total_cost_usd = weight_oz * buy_usd_oz
    weight_chi = weight_g / G_PER_CHI
    total_revenue_vnd = weight_chi * (sell_vnd_wan * 10_000)
    total_revenue_usd = total_revenue_vnd / rate_vnd_usd
    net_profit = total_revenue_usd - total_cost_usd - expense_usd
    roi = (net_profit / total_cost_usd) * 100
    return {
        "cost": total_cost_usd,
        "revenue": total_revenue_usd,
        "net_profit": net_profit,
        "roi": roi,
        "weight_oz": weight_oz,
        "weight_chi": weight_chi,
    }


def format_result(
    result: dict,
    weight_g: float,
    buy: float,
    sell: float,
    rate: float,
    expenses: dict,
) -> str:
    total_exp = sum(expenses.values())
    profit_emoji = "🚀" if result["net_profit"] > 0 else "📉"
    roi_emoji = "📈" if result["roi"] > 0 else "📉"
    sign = "+" if result["net_profit"] > 0 else ""

    exp_lines = ""
    labels = {
        "ticket": "✈️ 機票",
        "hotel": "🏨 住宿",
        "meal": "🍜 餐飲",
        "transport": "🚗 交通",
        "channel": "🔒 通道費",
        "referral": "🤝 介紹費",
    }
    for key, label in labels.items():
        val = expenses.get(key, 0)
        if val > 0:
            exp_lines += f"  {label}: ${val:.2f}\n"

    exp_section = ""
    if total_exp > 0:
        exp_section = f"""
📦 *開銷明細*
{exp_lines}  合計: ${total_exp:.2f} USD
"""

    return f"""
{profit_emoji} *黃金套利計算結果*
━━━━━━━━━━━━━━━━━━━━
📌 *輸入參數*
  重量: {weight_g}g（{result['weight_oz']:.4f} oz · {result['weight_chi']:.2f} 錢）
  香港買價: ${buy:.2f}/oz
  越南賣價: {sell:.0f} 萬 VND/錢
  匯率: {rate:,.0f} VND/USD
{exp_section}
💰 *計算結果*
  總成本: ${result['cost']:.2f} USD
  總營收: ${result['revenue']:.2f} USD
  ────────────────
  {profit_emoji} 淨利潤: `{sign}${result['net_profit']:.2f} USD`
  {roi_emoji} 投資報酬率: `{sign}{result['roi']:.2f}%`
━━━━━━━━━━━━━━━━━━━━
⚠️ 僅供參考，不構成投資建議
"""


# ── 指令處理 ──────────────────────────────────────────────────────────
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    keyboard = [
        [
            InlineKeyboardButton("📊 引導式計算", callback_data="start_calc"),
            InlineKeyboardButton("⚡ 快速計算", callback_data="show_quick"),
        ],
        [InlineKeyboardButton("❓ 使用說明", callback_data="show_help")],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(
        "🥇 *黃金套利計算器*\n\n"
        "港越黃金跨境套利即時計算工具\n"
        "支援開銷細項拆分（機票/住宿/餐飲/交通/通道費/介紹費）\n\n"
        "請選擇操作方式：",
        parse_mode="Markdown",
        reply_markup=reply_markup,
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = (
        "📖 *使用說明*\n\n"
        "*指令列表：*\n"
        "• `/start` — 顯示主選單\n"
        "• `/calc` — 引導式計算（逐步輸入）\n"
        "• `/quick <買價> <賣價> <匯率> [重量] [開銷]` — 快速計算\n"
        "• `/help` — 顯示此說明\n"
        "• `/cancel` — 取消當前對話\n\n"
        "*快速計算範例：*\n"
        "`/quick 5298.5 1767 26825 300 200`\n\n"
        "*參數說明：*\n"
        "• 買價：香港買價 (USD/oz)\n"
        "• 賣價：越南賣價 (萬 VND/錢)\n"
        "• 匯率：VND/USD 匯率\n"
        "• 重量：黃金重量（克，預設 300g）\n"
        "• 開銷：固定開銷（USD，預設 0）\n\n"
        "*引導式計算* 支援細項開銷拆分（機票/住宿/餐飲/交通/通道費/介紹費）"
    )
    target = update.message or update.callback_query.message
    await target.reply_text(text, parse_mode="Markdown")


async def quick_calc(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    args = context.args
    if not args or len(args) < 3:
        await update.message.reply_text(
            "❌ 格式錯誤\n\n"
            "用法：`/quick <買價> <賣價> <匯率> [重量] [開銷]`\n"
            "範例：`/quick 5298.5 1767 26825 300 200`",
            parse_mode="Markdown",
        )
        return

    try:
        buy = float(args[0])
        sell = float(args[1])
        rate = float(args[2])
        weight = float(args[3]) if len(args) > 3 else 300.0
        expense = float(args[4]) if len(args) > 4 else 0.0
    except ValueError:
        await update.message.reply_text("❌ 請輸入有效的數字")
        return

    result = calc_arbitrage(buy, sell, rate, weight, expense)
    expenses = {"ticket": 0, "hotel": 0, "meal": 0, "transport": 0, "channel": 0, "referral": expense}
    msg = format_result(result, weight, buy, sell, rate, expenses)
    await update.message.reply_text(msg, parse_mode="Markdown")

    # 高利潤推播
    if result["roi"] > ROI_ALERT_THRESHOLD and ALERT_CHAT_IDS:
        alert_msg = (
            f"🚨 *高利潤套利機會！*\n"
            f"ROI: `{result['roi']:.2f}%` | 淨利潤: `${result['net_profit']:.2f} USD`\n"
            f"買價 ${buy}/oz · 賣價 {sell}萬 · 匯率 {rate:,.0f} · {weight}g"
        )
        for chat_id in ALERT_CHAT_IDS:
            try:
                await context.bot.send_message(
                    chat_id=chat_id,
                    text=alert_msg,
                    parse_mode="Markdown",
                )
            except Exception as e:
                logger.warning(f"Failed to send alert to {chat_id}: {e}")


# ── 引導式計算 ConversationHandler ────────────────────────────────────
async def calc_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    context.user_data["expenses"] = {
        "ticket": 0, "hotel": 0, "meal": 0,
        "transport": 0, "channel": 0, "referral": 0,
    }
    target = update.message or update.callback_query.message
    await target.reply_text(
        "📊 *引導式計算*\n\n"
        "第 1 步：請輸入 *黃金重量（克）*\n"
        "常用：200g / 280g / 300g\n"
        "（直接輸入數字，例如：`300`）",
        parse_mode="Markdown",
    )
    return ASK_WEIGHT


async def ask_buy(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        weight = float(update.message.text.strip())
        if weight <= 0:
            raise ValueError
        context.user_data["weight"] = weight
        oz = weight / G_PER_OZ
        chi = weight / G_PER_CHI
        await update.message.reply_text(
            f"✅ 重量：{weight}g（≈ {oz:.4f} oz · {chi:.2f} 錢）\n\n"
            f"第 2 步：請輸入 *香港買價（USD/oz）*\n"
            f"例如：`5298.5`",
            parse_mode="Markdown",
        )
        return ASK_BUY
    except ValueError:
        await update.message.reply_text("❌ 請輸入有效的正數，例如：`300`", parse_mode="Markdown")
        return ASK_WEIGHT


async def ask_sell(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        buy = float(update.message.text.strip())
        if buy <= 0:
            raise ValueError
        context.user_data["buy"] = buy
        await update.message.reply_text(
            f"✅ 香港買價：${buy}/oz\n\n"
            f"第 3 步：請輸入 *越南賣價（萬 VND/錢）*\n"
            f"例如：`1767`",
            parse_mode="Markdown",
        )
        return ASK_SELL
    except ValueError:
        await update.message.reply_text("❌ 請輸入有效的正數，例如：`5298.5`", parse_mode="Markdown")
        return ASK_BUY


async def ask_rate(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        sell = float(update.message.text.strip())
        if sell <= 0:
            raise ValueError
        context.user_data["sell"] = sell
        await update.message.reply_text(
            f"✅ 越南賣價：{sell} 萬 VND/錢\n\n"
            f"第 4 步：請輸入 *匯率（VND/USD）*\n"
            f"例如：`26825`",
            parse_mode="Markdown",
        )
        return ASK_RATE
    except ValueError:
        await update.message.reply_text("❌ 請輸入有效的正數，例如：`1767`", parse_mode="Markdown")
        return ASK_SELL


async def ask_expense_ticket(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        rate = float(update.message.text.strip())
        if rate <= 0:
            raise ValueError
        context.user_data["rate"] = rate
        await update.message.reply_text(
            f"✅ 匯率：{rate:,.0f} VND/USD\n\n"
            f"📦 *開銷細項輸入*（輸入 0 可跳過）\n\n"
            f"第 5 步：✈️ *機票費用（USD）*\n"
            f"例如：`150`（無則輸入 `0`）",
            parse_mode="Markdown",
        )
        return ASK_EXPENSE_TICKET
    except ValueError:
        await update.message.reply_text("❌ 請輸入有效的正數，例如：`26825`", parse_mode="Markdown")
        return ASK_RATE


async def ask_expense_hotel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        val = float(update.message.text.strip())
        context.user_data["expenses"]["ticket"] = max(0, val)
        await update.message.reply_text(
            f"✅ 機票：${val:.2f}\n\n"
            f"第 6 步：🏨 *飯店住宿（USD）*\n"
            f"例如：`60`（無則輸入 `0`）",
            parse_mode="Markdown",
        )
        return ASK_EXPENSE_HOTEL
    except ValueError:
        await update.message.reply_text("❌ 請輸入有效數字，例如：`150`", parse_mode="Markdown")
        return ASK_EXPENSE_TICKET


async def ask_expense_meal(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        val = float(update.message.text.strip())
        context.user_data["expenses"]["hotel"] = max(0, val)
        await update.message.reply_text(
            f"✅ 住宿：${val:.2f}\n\n"
            f"第 7 步：🍜 *餐飲雜支（USD）*\n"
            f"例如：`30`（無則輸入 `0`）",
            parse_mode="Markdown",
        )
        return ASK_EXPENSE_MEAL
    except ValueError:
        await update.message.reply_text("❌ 請輸入有效數字", parse_mode="Markdown")
        return ASK_EXPENSE_HOTEL


async def ask_expense_transport(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        val = float(update.message.text.strip())
        context.user_data["expenses"]["meal"] = max(0, val)
        await update.message.reply_text(
            f"✅ 餐飲：${val:.2f}\n\n"
            f"第 8 步：🚗 *交通車費（USD）*\n"
            f"例如：`20`（無則輸入 `0`）",
            parse_mode="Markdown",
        )
        return ASK_EXPENSE_TRANSPORT
    except ValueError:
        await update.message.reply_text("❌ 請輸入有效數字", parse_mode="Markdown")
        return ASK_EXPENSE_MEAL


async def ask_expense_channel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        val = float(update.message.text.strip())
        context.user_data["expenses"]["transport"] = max(0, val)
        await update.message.reply_text(
            f"✅ 交通：${val:.2f}\n\n"
            f"第 9 步：🔒 *通道費（USD）*\n"
            f"例如：`50`（無則輸入 `0`）",
            parse_mode="Markdown",
        )
        return ASK_EXPENSE_CHANNEL
    except ValueError:
        await update.message.reply_text("❌ 請輸入有效數字", parse_mode="Markdown")
        return ASK_EXPENSE_TRANSPORT


async def ask_expense_referral(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        val = float(update.message.text.strip())
        context.user_data["expenses"]["channel"] = max(0, val)
        await update.message.reply_text(
            f"✅ 通道費：${val:.2f}\n\n"
            f"第 10 步：🤝 *介紹費（USD）*\n"
            f"例如：`100`（無則輸入 `0`）",
            parse_mode="Markdown",
        )
        return ASK_EXPENSE_REFERRAL
    except ValueError:
        await update.message.reply_text("❌ 請輸入有效數字", parse_mode="Markdown")
        return ASK_EXPENSE_CHANNEL


async def finish_calc(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        val = float(update.message.text.strip())
        context.user_data["expenses"]["referral"] = max(0, val)
    except ValueError:
        await update.message.reply_text("❌ 請輸入有效數字", parse_mode="Markdown")
        return ASK_EXPENSE_REFERRAL

    data = context.user_data
    expenses = data.get("expenses", {})
    total_expense = sum(expenses.values())

    result = calc_arbitrage(
        buy_usd_oz=data["buy"],
        sell_vnd_wan=data["sell"],
        rate_vnd_usd=data["rate"],
        weight_g=data["weight"],
        expense_usd=total_expense,
    )

    msg = format_result(
        result, data["weight"], data["buy"], data["sell"], data["rate"], expenses
    )
    await update.message.reply_text(msg, parse_mode="Markdown")

    # 高利潤推播
    if result["roi"] > ROI_ALERT_THRESHOLD and ALERT_CHAT_IDS:
        alert_msg = (
            f"🚨 *高利潤套利機會！*\n"
            f"ROI: `{result['roi']:.2f}%` | 淨利潤: `${result['net_profit']:.2f} USD`\n"
            f"買價 ${data['buy']}/oz · 賣價 {data['sell']}萬 · 匯率 {data['rate']:,.0f} · {data['weight']}g\n"
            f"開銷合計: ${total_expense:.2f} USD"
        )
        for chat_id in ALERT_CHAT_IDS:
            try:
                await context.bot.send_message(
                    chat_id=chat_id,
                    text=alert_msg,
                    parse_mode="Markdown",
                )
            except Exception as e:
                logger.warning(f"Failed to send alert to {chat_id}: {e}")

    context.user_data.clear()
    return ConversationHandler.END


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    await update.message.reply_text(
        "❌ 已取消計算。\n輸入 /start 重新開始。"
    )
    return ConversationHandler.END


async def button_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    if query.data == "start_calc":
        return await calc_start(update, context)
    elif query.data == "show_quick":
        await query.message.reply_text(
            "⚡ *快速計算*\n\n"
            "格式：`/quick <買價> <賣價> <匯率> [重量] [開銷]`\n\n"
            "範例：\n`/quick 5298.5 1767 26825 300 200`",
            parse_mode="Markdown",
        )
    elif query.data == "show_help":
        await help_command(update, context)
    return ConversationHandler.END


# ── 主程式 ────────────────────────────────────────────────────────────
def main() -> None:
    if not TOKEN:
        raise ValueError("TELEGRAM_BOT_TOKEN 環境變數未設定")

    app = Application.builder().token(TOKEN).build()

    conv_handler = ConversationHandler(
        entry_points=[
            CommandHandler("calc", calc_start),
            CallbackQueryHandler(button_callback, pattern="^start_calc$"),
        ],
        states={
            ASK_WEIGHT:           [MessageHandler(filters.TEXT & ~filters.COMMAND, ask_buy)],
            ASK_BUY:              [MessageHandler(filters.TEXT & ~filters.COMMAND, ask_sell)],
            ASK_SELL:             [MessageHandler(filters.TEXT & ~filters.COMMAND, ask_rate)],
            ASK_RATE:             [MessageHandler(filters.TEXT & ~filters.COMMAND, ask_expense_ticket)],
            ASK_EXPENSE_TICKET:   [MessageHandler(filters.TEXT & ~filters.COMMAND, ask_expense_hotel)],
            ASK_EXPENSE_HOTEL:    [MessageHandler(filters.TEXT & ~filters.COMMAND, ask_expense_meal)],
            ASK_EXPENSE_MEAL:     [MessageHandler(filters.TEXT & ~filters.COMMAND, ask_expense_transport)],
            ASK_EXPENSE_TRANSPORT:[MessageHandler(filters.TEXT & ~filters.COMMAND, ask_expense_channel)],
            ASK_EXPENSE_CHANNEL:  [MessageHandler(filters.TEXT & ~filters.COMMAND, ask_expense_referral)],
            ASK_EXPENSE_REFERRAL: [MessageHandler(filters.TEXT & ~filters.COMMAND, finish_calc)],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
    )

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("quick", quick_calc))
    app.add_handler(conv_handler)
    app.add_handler(CallbackQueryHandler(button_callback))

    logger.info("🥇 黃金套利機器人啟動中...")
    logger.info(f"ROI 警報閾值: {ROI_ALERT_THRESHOLD}%")
    logger.info(f"推播目標聊天室: {ALERT_CHAT_IDS if ALERT_CHAT_IDS else '未設定'}")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
