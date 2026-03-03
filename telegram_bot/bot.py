#!/usr/bin/env python3
"""
黃金套利計算 Telegram 機器人
Gold Arbitrage Calculator Telegram Bot

支援指令:
  /start  - 歡迎訊息與使用說明
  /calc   - 開始計算套利利潤（引導式輸入）
  /quick  - 快速計算（單行輸入所有參數）
  /help   - 顯示幫助訊息

環境變數:
  TELEGRAM_BOT_TOKEN  - Telegram Bot Token (必填)
  ROI_ALERT_THRESHOLD - 高利潤通知閾值，預設 2.0 (%)
"""

import os
import logging
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

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

# 常數
G_PER_OZ = 31.1035
G_PER_CHI = 3.75

# 對話狀態
ASK_BUY, ASK_SELL, ASK_RATE, ASK_WEIGHT, ASK_EXPENSE = range(5)

# 預設值
DEFAULT_WEIGHT = 300
DEFAULT_EXPENSE = 200
ROI_THRESHOLD = float(os.getenv("ROI_ALERT_THRESHOLD", "2.0"))


def calc_arbitrage(buy_usd_oz: float, sell_vnd_wan: float, rate_vnd_usd: float,
                   weight_g: float = 300, expense_usd: float = 200) -> dict:
    """計算黃金套利利潤 (HK -> VN)"""
    weight_oz = weight_g / G_PER_OZ
    total_cost_usd = weight_oz * buy_usd_oz

    weight_chi = weight_g / G_PER_CHI
    total_revenue_vnd = weight_chi * (sell_vnd_wan * 10000)
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


def format_result(result: dict, params: dict) -> str:
    """格式化計算結果為 Telegram 訊息"""
    profit = result["net_profit"]
    roi = result["roi"]
    is_profit = profit > 0
    emoji = "🚀" if roi > ROI_THRESHOLD else ("✅" if is_profit else "❌")

    sign = "+" if profit > 0 else ""
    roi_sign = "+" if roi > 0 else ""

    lines = [
        f"{emoji} *黃金套利計算結果*",
        "",
        "📊 *輸入參數*",
        f"  ⚖️ 重量：{params['weight_g']}g（{result['weight_oz']:.4f} oz / {result['weight_chi']:.2f} 錢）",
        f"  💰 香港買價：${params['buy_usd_oz']:.2f} USD/oz",
        f"  💵 越南賣價：{params['sell_vnd_wan']} 萬 VND/錢",
        f"  📈 匯率：{params['rate_vnd_usd']:,.0f} VND/USD",
        f"  💸 固定開銷：${params['expense_usd']:.2f} USD",
        "",
        "💼 *計算結果*",
        f"  📦 總成本：${result['cost']:,.2f} USD",
        f"  📤 總營收：${result['revenue']:,.2f} USD",
        "",
        "─────────────────",
        f"  💎 *淨利潤：{sign}${profit:,.2f} USD*",
        f"  📈 *投資報酬率：{roi_sign}{roi:.2f}%*",
        "─────────────────",
    ]

    if roi > ROI_THRESHOLD:
        lines.append(f"\n🔥 *高利潤套利機會！ROI 超過 {ROI_THRESHOLD}%*")

    lines.append("\n_僅供參考，不構成投資建議_")
    return "\n".join(lines)


# ---- 指令處理器 ----

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """處理 /start 指令"""
    keyboard = [
        [InlineKeyboardButton("🧮 開始計算", callback_data="start_calc")],
        [InlineKeyboardButton("⚡ 快速計算格式", callback_data="show_quick")],
        [InlineKeyboardButton("❓ 幫助", callback_data="show_help")],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    text = (
        "👋 *歡迎使用黃金套利計算器！*\n\n"
        "本機器人幫助您快速評估\n"
        "🇭🇰 香港買入 → 🇻🇳 越南賣出 的套利空間\n\n"
        "📌 *計算公式*\n"
        "• 成本 = (重量/31.1035) × 香港買價\n"
        "• 營收 = (重量/3.75) × 越南賣價(萬) × 10000 ÷ 匯率\n"
        "• 淨利 = 營收 - 成本 - 固定開銷\n\n"
        "請選擇操作："
    )
    await update.message.reply_text(text, reply_markup=reply_markup, parse_mode="Markdown")


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """處理 /help 指令"""
    text = (
        "📖 *使用說明*\n\n"
        "*指令列表：*\n"
        "• `/start` - 顯示歡迎訊息\n"
        "• `/calc` - 引導式計算（逐步輸入）\n"
        "• `/quick <買價> <賣價> <匯率> [重量] [開銷]` - 快速計算\n"
        "• `/help` - 顯示此說明\n\n"
        "*快速計算範例：*\n"
        "`/quick 5298.5 1767 26825 300 200`\n\n"
        "*參數說明：*\n"
        "• 買價：香港黃金買價 (USD/oz)\n"
        "• 賣價：越南黃金賣價 (萬 VND/錢)\n"
        "• 匯率：VND/USD 匯率\n"
        "• 重量：黃金重量（克），預設 300g\n"
        "• 開銷：固定開銷（USD），預設 200\n\n"
        f"*高利潤通知閾值：* ROI > {ROI_THRESHOLD}%"
    )
    await update.message.reply_text(text, parse_mode="Markdown")


async def quick_calc(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """處理 /quick 快速計算指令"""
    args = context.args
    if not args or len(args) < 3:
        await update.message.reply_text(
            "❌ 格式錯誤\n\n"
            "正確格式：\n"
            "`/quick <買價> <賣價> <匯率> [重量] [開銷]`\n\n"
            "範例：\n"
            "`/quick 5298.5 1767 26825 300 200`",
            parse_mode="Markdown"
        )
        return

    try:
        buy_usd_oz = float(args[0])
        sell_vnd_wan = float(args[1])
        rate_vnd_usd = float(args[2])
        weight_g = float(args[3]) if len(args) > 3 else DEFAULT_WEIGHT
        expense_usd = float(args[4]) if len(args) > 4 else DEFAULT_EXPENSE

        result = calc_arbitrage(buy_usd_oz, sell_vnd_wan, rate_vnd_usd, weight_g, expense_usd)
        params = {
            "buy_usd_oz": buy_usd_oz,
            "sell_vnd_wan": sell_vnd_wan,
            "rate_vnd_usd": rate_vnd_usd,
            "weight_g": weight_g,
            "expense_usd": expense_usd,
        }
        await update.message.reply_text(
            format_result(result, params),
            parse_mode="Markdown"
        )
    except ValueError:
        await update.message.reply_text(
            "❌ 參數格式錯誤，請確認所有數值為有效數字。\n\n"
            "範例：`/quick 5298.5 1767 26825 300 200`",
            parse_mode="Markdown"
        )


# ---- 引導式對話 ----

async def calc_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """開始引導式計算"""
    context.user_data.clear()
    if update.callback_query:
        await update.callback_query.answer()
        await update.callback_query.message.reply_text(
            "🧮 *開始計算套利利潤*\n\n"
            "第 1/5 步：請輸入 *香港黃金買價*（USD/oz）\n\n"
            "例如：`5298.5`\n\n"
            "輸入 /cancel 取消",
            parse_mode="Markdown"
        )
    else:
        await update.message.reply_text(
            "🧮 *開始計算套利利潤*\n\n"
            "第 1/5 步：請輸入 *香港黃金買價*（USD/oz）\n\n"
            "例如：`5298.5`\n\n"
            "輸入 /cancel 取消",
            parse_mode="Markdown"
        )
    return ASK_BUY


async def ask_buy(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        val = float(update.message.text.strip())
        if val <= 0:
            raise ValueError
        context.user_data["buy_usd_oz"] = val
        await update.message.reply_text(
            f"✅ 買價：${val:.2f} USD/oz\n\n"
            "第 2/5 步：請輸入 *越南黃金賣價*（萬 VND/錢）\n\n"
            "例如：`1767`",
            parse_mode="Markdown"
        )
        return ASK_SELL
    except (ValueError, TypeError):
        await update.message.reply_text("❌ 請輸入有效的正數，例如：`5298.5`", parse_mode="Markdown")
        return ASK_BUY


async def ask_sell(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        val = float(update.message.text.strip())
        if val <= 0:
            raise ValueError
        context.user_data["sell_vnd_wan"] = val
        await update.message.reply_text(
            f"✅ 賣價：{val} 萬 VND/錢\n\n"
            "第 3/5 步：請輸入 *匯率*（VND/USD）\n\n"
            "例如：`26825`",
            parse_mode="Markdown"
        )
        return ASK_RATE
    except (ValueError, TypeError):
        await update.message.reply_text("❌ 請輸入有效的正數，例如：`1767`", parse_mode="Markdown")
        return ASK_SELL


async def ask_rate(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        val = float(update.message.text.strip())
        if val <= 0:
            raise ValueError
        context.user_data["rate_vnd_usd"] = val

        keyboard = [
            [
                InlineKeyboardButton("200g", callback_data="weight_200"),
                InlineKeyboardButton("280g", callback_data="weight_280"),
                InlineKeyboardButton("300g", callback_data="weight_300"),
            ]
        ]
        await update.message.reply_text(
            f"✅ 匯率：{val:,.0f} VND/USD\n\n"
            "第 4/5 步：請輸入 *黃金重量*（克）\n\n"
            "快速選擇：",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode="Markdown"
        )
        return ASK_WEIGHT
    except (ValueError, TypeError):
        await update.message.reply_text("❌ 請輸入有效的正數，例如：`26825`", parse_mode="Markdown")
        return ASK_RATE


async def weight_button(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    weight = int(query.data.split("_")[1])
    context.user_data["weight_g"] = float(weight)
    await query.message.reply_text(
        f"✅ 重量：{weight}g\n\n"
        "第 5/5 步：請輸入 *固定開銷*（USD）\n\n"
        f"例如：`200`（直接按 Enter 使用預設值 {DEFAULT_EXPENSE}）",
        parse_mode="Markdown"
    )
    return ASK_EXPENSE


async def ask_weight(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try:
        val = float(update.message.text.strip())
        if val <= 0:
            raise ValueError
        context.user_data["weight_g"] = val
        await update.message.reply_text(
            f"✅ 重量：{val}g\n\n"
            "第 5/5 步：請輸入 *固定開銷*（USD）\n\n"
            f"例如：`200`（預設 {DEFAULT_EXPENSE}）",
            parse_mode="Markdown"
        )
        return ASK_EXPENSE
    except (ValueError, TypeError):
        await update.message.reply_text("❌ 請輸入有效的正數，例如：`300`", parse_mode="Markdown")
        return ASK_WEIGHT


async def ask_expense(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    try:
        val = float(text) if text else DEFAULT_EXPENSE
        if val < 0:
            raise ValueError
        context.user_data["expense_usd"] = val

        # 執行計算
        d = context.user_data
        result = calc_arbitrage(
            d["buy_usd_oz"], d["sell_vnd_wan"], d["rate_vnd_usd"],
            d.get("weight_g", DEFAULT_WEIGHT), val
        )
        params = {
            "buy_usd_oz": d["buy_usd_oz"],
            "sell_vnd_wan": d["sell_vnd_wan"],
            "rate_vnd_usd": d["rate_vnd_usd"],
            "weight_g": d.get("weight_g", DEFAULT_WEIGHT),
            "expense_usd": val,
        }

        keyboard = [[InlineKeyboardButton("🔄 再計算一次", callback_data="start_calc")]]
        await update.message.reply_text(
            format_result(result, params),
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode="Markdown"
        )
        return ConversationHandler.END
    except (ValueError, TypeError):
        await update.message.reply_text("❌ 請輸入有效的數字，例如：`200`", parse_mode="Markdown")
        return ASK_EXPENSE


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    await update.message.reply_text(
        "❌ 計算已取消。輸入 /start 重新開始。"
    )
    return ConversationHandler.END


async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    if query.data == "start_calc":
        await calc_start(update, context)
    elif query.data == "show_quick":
        await query.message.reply_text(
            "⚡ *快速計算格式*\n\n"
            "`/quick <買價> <賣價> <匯率> [重量] [開銷]`\n\n"
            "範例：\n"
            "`/quick 5298.5 1767 26825 300 200`",
            parse_mode="Markdown"
        )
    elif query.data == "show_help":
        await query.message.reply_text(
            "📖 輸入 /help 查看完整說明",
            parse_mode="Markdown"
        )


def main() -> None:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        raise ValueError("TELEGRAM_BOT_TOKEN 環境變數未設定！")

    app = Application.builder().token(token).build()

    # 引導式對話處理器
    conv_handler = ConversationHandler(
        entry_points=[
            CommandHandler("calc", calc_start),
        ],
        states={
            ASK_BUY: [MessageHandler(filters.TEXT & ~filters.COMMAND, ask_buy)],
            ASK_SELL: [MessageHandler(filters.TEXT & ~filters.COMMAND, ask_sell)],
            ASK_RATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, ask_rate)],
            ASK_WEIGHT: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, ask_weight),
                CallbackQueryHandler(weight_button, pattern="^weight_"),
            ],
            ASK_EXPENSE: [MessageHandler(filters.TEXT & ~filters.COMMAND, ask_expense)],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
    )

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("quick", quick_calc))
    app.add_handler(conv_handler)
    app.add_handler(CallbackQueryHandler(button_handler))

    logger.info("🤖 Telegram 機器人啟動中...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
