"""
VPN Platform Telegram Bot
Commands:
  User:  /start, /login <token>, /usage, /sub, /help
  Admin: /users, /adduser, /disable <username>, /enable <username>, /broadcast <msg>
"""

import asyncio
import logging
import os
import bcrypt
from datetime import datetime, timezone

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    CallbackQueryHandler,
)
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select, update as sa_update

# ── Config ────────────────────────────────────────────────────────────────────
BOT_TOKEN        = os.environ["TELEGRAM_BOT_TOKEN"]
ADMIN_CHAT_IDS   = [int(x) for x in os.environ.get("TELEGRAM_ADMIN_IDS", "").split(",") if x.strip()]
DATABASE_URL     = os.environ["DATABASE_URL"]
SUB_BASE_URL     = os.environ.get("SUBSCRIPTION_BASE_URL", "http://localhost:8080")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Database ──────────────────────────────────────────────────────────────────
engine = create_async_engine(DATABASE_URL)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

from models import User


# ── Helpers ───────────────────────────────────────────────────────────────────
def fmt_bytes(b: int) -> str:
    if b >= 1e9:
        return f"{b/1e9:.2f} GB"
    if b >= 1e6:
        return f"{b/1e6:.1f} MB"
    if b >= 1e3:
        return f"{b/1e3:.1f} KB"
    return f"{b} B"


def fmt_expiry(expires_at) -> str:
    if not expires_at:
        return "No expiry"
    now = datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    delta = expires_at - now
    if delta.days < 0:
        return "Expired"
    if delta.days == 0:
        return "Expires today!"
    return f"{delta.days} days left ({expires_at.strftime('%d/%m/%Y')})"


async def get_user_by_telegram(db: AsyncSession, telegram_id: int):
    result = await db.execute(
        select(User).where(User.telegram_id == telegram_id, User.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()


def is_admin(update: Update) -> bool:
    return update.effective_user.id in ADMIN_CHAT_IDS


# ── User Commands ─────────────────────────────────────────────────────────────
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    async with SessionLocal() as db:
        user = await get_user_by_telegram(db, update.effective_user.id)

    if user:
        await update.message.reply_text(
            f"Welcome back, *{user.username}*\\!\n\n"
            "Use /usage to check your data\\.\n"
            "Use /sub to get your subscription links\\.",
            parse_mode="MarkdownV2",
        )
    else:
        await update.message.reply_text(
            "Welcome to VPN Platform\\! 🔐\n\n"
            "To link your account, use:\n"
            "`/login YOUR_TOKEN`\n\n"
            "Your token is in your subscription URL\\.",
            parse_mode="MarkdownV2",
        )


async def cmd_login(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) < 2:
        await update.message.reply_text(
            "Usage: /login <email> <password>\n"
            "Example: /login you@email.com yourpassword"
        )
        return

    email = context.args[0].strip().lower()
    password = context.args[1].strip()

    async with SessionLocal() as db:
        result = await db.execute(
            select(User).where(
                User.email == email,
                User.deleted_at.is_(None),
            )
        )
        user = result.scalar_one_or_none()

        if not user or not user.hashed_password:
            await update.message.reply_text("❌ Invalid email or password.")
            return

        if not bcrypt.checkpw(password.encode(), user.hashed_password.encode()):
            await update.message.reply_text("❌ Invalid email or password.")
            return

        if user.payment_status == "pending_payment":
            await update.message.reply_text(
                "⏳ Your payment is still pending.\n"
                "Please complete your payment and try again."
            )
            return

        if user.telegram_id and user.telegram_id != update.effective_user.id:
            await update.message.reply_text("⚠️ This account is already linked to another Telegram account.")
            return

        # Link telegram_id
        await db.execute(
            sa_update(User)
            .where(User.id == user.id)
            .values(telegram_id=update.effective_user.id)
        )
        await db.commit()

    base = SUB_BASE_URL.rstrip("/")
    token = str(user.subscription_token)
    await update.message.reply_text(
        f"✅ Account linked successfully\\!\n\n"
        f"Username: *{user.username}*\n"
        f"Use /usage to check your data\\.\n"
        f"Use /sub to get your subscription links\\.",
        parse_mode="MarkdownV2",
    )


async def cmd_usage(update: Update, context: ContextTypes.DEFAULT_TYPE):
    async with SessionLocal() as db:
        user = await get_user_by_telegram(db, update.effective_user.id)

    if not user:
        await update.message.reply_text("Account not linked. Use /login YOUR_TOKEN first.")
        return

    used = user.bytes_used
    quota = user.quota_bytes
    status = "Active ✅" if user.is_active else f"Disabled ❌ ({user.disabled_reason or 'unknown'})"

    if quota == 0:
        usage_line = f"Usage: {fmt_bytes(used)} / Unlimited"
        pct = 0
    else:
        pct = min(100, int(used / quota * 100))
        bar_filled = int(pct / 10)
        bar = "█" * bar_filled + "░" * (10 - bar_filled)
        usage_line = f"Usage: {fmt_bytes(used)} / {fmt_bytes(quota)}\n[{bar}] {pct}%"

    text = (
        f"📊 *{user.username}* — Account Status\n\n"
        f"Status: {status}\n"
        f"{usage_line}\n"
        f"Expiry: {fmt_expiry(user.expires_at)}"
    )

    await update.message.reply_text(text, parse_mode="Markdown")


async def cmd_sub(update: Update, context: ContextTypes.DEFAULT_TYPE):
    async with SessionLocal() as db:
        user = await get_user_by_telegram(db, update.effective_user.id)

    if not user:
        await update.message.reply_text("Account not linked. Use /login <email> <password> first.")
        return

    if not user.is_active:
        await update.message.reply_text("Your account is disabled. Contact support.")
        return

    token = str(user.subscription_token)
    base = SUB_BASE_URL.rstrip("/")

    sub_base   = f"{base}/sub/{token}"
    clash_url  = f"{sub_base}?format=clash"
    v2ray_url  = f"{sub_base}?format=v2rayng"
    surge_url  = f"{sub_base}?format=surge"
    sfa_url    = f"{sub_base}?format=singbox"
    raw_url    = sub_base  # Shadowrocket / Quantumult / raw SS

    # ── iOS ──────────────────────────────────────────────────────────────────
    ios_keyboard = [
        [InlineKeyboardButton("🚀 Shadowrocket", url=raw_url)],
        [InlineKeyboardButton("📡 Quantumult X", url=raw_url)],
        [InlineKeyboardButton("⚡ Surge (iOS)", url=surge_url)],
        [InlineKeyboardButton("🌐 Stash (Clash)", url=clash_url)],
        [InlineKeyboardButton("🔷 sing-box (SFA)", url=sfa_url)],
    ]

    # ── Android ──────────────────────────────────────────────────────────────
    android_keyboard = [
        [InlineKeyboardButton("📡 v2rayNG", url=v2ray_url)],
        [InlineKeyboardButton("⚡ Clash Meta (ClashX)", url=clash_url)],
        [InlineKeyboardButton("🔷 sing-box (SFM)", url=sfa_url)],
        [InlineKeyboardButton("🌐 NekoBox", url=clash_url)],
    ]

    # ── Windows ──────────────────────────────────────────────────────────────
    windows_keyboard = [
        [InlineKeyboardButton("⚡ Clash Verge Rev", url=clash_url)],
        [InlineKeyboardButton("🔷 sing-box", url=sfa_url)],
        [InlineKeyboardButton("🌐 NekoRay / NekoBox", url=v2ray_url)],
        [InlineKeyboardButton("📡 v2rayN", url=v2ray_url)],
        [InlineKeyboardButton("🚀 Shadowsocks-Windows", url=raw_url)],
    ]

    # ── macOS ─────────────────────────────────────────────────────────────────
    mac_keyboard = [
        [InlineKeyboardButton("🚀 Shadowrocket (Mac)", url=raw_url)],
        [InlineKeyboardButton("⚡ Surge (macOS)", url=surge_url)],
        [InlineKeyboardButton("⚡ Clash Verge Rev", url=clash_url)],
        [InlineKeyboardButton("🔷 sing-box", url=sfa_url)],
        [InlineKeyboardButton("🌐 ClashX Meta", url=clash_url)],
    ]

    # ── Linux ─────────────────────────────────────────────────────────────────
    linux_keyboard = [
        [InlineKeyboardButton("⚡ Clash Meta (CLI)", url=clash_url)],
        [InlineKeyboardButton("🔷 sing-box (CLI)", url=sfa_url)],
        [InlineKeyboardButton("🌐 NekoRay", url=v2ray_url)],
        [InlineKeyboardButton("📡 v2rayA (WebUI)", url=clash_url)],
        [InlineKeyboardButton("🚀 Shadowsocks-libev", url=raw_url)],
    ]

    async def send_section(title: str, keyboard):
        await update.message.reply_text(
            title,
            parse_mode="Markdown",
            reply_markup=InlineKeyboardMarkup(keyboard),
        )

    await update.message.reply_text(
        "🔗 *Your Subscription Links*\n\n"
        "Choose your platform and tap the app to import\\.",
        parse_mode="MarkdownV2",
    )
    await send_section("📱 *iOS / iPhone / iPad*", ios_keyboard)
    await send_section("🤖 *Android*", android_keyboard)
    await send_section("🖥 *Windows*", windows_keyboard)
    await send_section("🍎 *macOS*", mac_keyboard)
    await send_section("🐧 *Linux*", linux_keyboard)


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = (
        "📖 *Available Commands*\n\n"
        "/start — Welcome message\n"
        "/login `<email> <password>` — Link your VPN account\n"
        "/usage — Check data usage & expiry\n"
        "/sub — Get subscription links\n"
        "/help — Show this message"
    )
    if is_admin(update):
        text += (
            "\n\n🔧 *Admin Commands*\n\n"
            "/users — List all users\n"
            "/adduser `<username> <quota_gb> <days>` — Create user\n"
            "/disable `<username>` — Disable user\n"
            "/enable `<username>` — Enable user\n"
            "/broadcast `<message>` — Message all users"
        )
    await update.message.reply_text(text, parse_mode="Markdown")


# ── Admin Commands ────────────────────────────────────────────────────────────
async def cmd_users(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update):
        await update.message.reply_text("Unauthorized.")
        return

    async with SessionLocal() as db:
        result = await db.execute(
            select(User).where(User.deleted_at.is_(None)).order_by(User.created_at.desc()).limit(20)
        )
        users = result.scalars().all()

    if not users:
        await update.message.reply_text("No users found.")
        return

    lines = ["👥 *Users* (latest 20)\n"]
    for u in users:
        status = "✅" if u.is_active else "❌"
        quota = fmt_bytes(u.quota_bytes) if u.quota_bytes > 0 else "∞"
        lines.append(f"{status} `{u.username}` — {fmt_bytes(u.bytes_used)}/{quota}")

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def cmd_adduser(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update):
        await update.message.reply_text("Unauthorized.")
        return

    if len(context.args) < 3:
        await update.message.reply_text("Usage: /adduser <username> <quota_gb> <days>\nExample: /adduser john 100 30")
        return

    username = context.args[0]
    try:
        quota_gb = float(context.args[1])
        days = int(context.args[2])
    except ValueError:
        await update.message.reply_text("Invalid quota or days. Use numbers.")
        return

    import uuid, secrets
    from datetime import timedelta

    async with SessionLocal() as db:
        # Check duplicate
        result = await db.execute(select(User).where(User.username == username))
        if result.scalar_one_or_none():
            await update.message.reply_text(f"User `{username}` already exists.", parse_mode="Markdown")
            return

        expires = datetime.now(timezone.utc) + timedelta(days=days)
        user = User(
            username=username,
            quota_bytes=int(quota_gb * 1e9),
            expires_at=expires,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    await update.message.reply_text(
        f"✅ User created\\!\n\n"
        f"Username: `{username}`\n"
        f"Quota: {quota_gb} GB\n"
        f"Expires: {expires.strftime('%d/%m/%Y')}\n\n"
        f"Token: `{user.subscription_token}`",
        parse_mode="MarkdownV2",
    )


async def cmd_disable(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update):
        await update.message.reply_text("Unauthorized.")
        return

    if not context.args:
        await update.message.reply_text("Usage: /disable <username>")
        return

    username = context.args[0]
    async with SessionLocal() as db:
        result = await db.execute(select(User).where(User.username == username, User.deleted_at.is_(None)))
        user = result.scalar_one_or_none()
        if not user:
            await update.message.reply_text(f"User `{username}` not found.", parse_mode="Markdown")
            return
        user.is_active = False
        user.disabled_reason = "admin_disabled"
        await db.commit()

    await update.message.reply_text(f"User `{username}` disabled.", parse_mode="Markdown")


async def cmd_enable(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update):
        await update.message.reply_text("Unauthorized.")
        return

    if not context.args:
        await update.message.reply_text("Usage: /enable <username>")
        return

    username = context.args[0]
    async with SessionLocal() as db:
        result = await db.execute(select(User).where(User.username == username, User.deleted_at.is_(None)))
        user = result.scalar_one_or_none()
        if not user:
            await update.message.reply_text(f"User `{username}` not found.", parse_mode="Markdown")
            return
        user.is_active = True
        user.disabled_reason = None
        await db.commit()

    await update.message.reply_text(f"User `{username}` enabled.", parse_mode="Markdown")


async def cmd_broadcast(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update):
        await update.message.reply_text("Unauthorized.")
        return

    if not context.args:
        await update.message.reply_text("Usage: /broadcast <message>")
        return

    message = " ".join(context.args)
    async with SessionLocal() as db:
        result = await db.execute(
            select(User).where(
                User.telegram_id.is_not(None),
                User.deleted_at.is_(None),
                User.is_active == True,
            )
        )
        users = result.scalars().all()

    sent = 0
    failed = 0
    for user in users:
        try:
            await context.bot.send_message(chat_id=user.telegram_id, text=f"📢 {message}")
            sent += 1
        except Exception:
            failed += 1

    await update.message.reply_text(f"Broadcast sent: {sent} delivered, {failed} failed.")


# ── Notification helpers (called by scheduler) ────────────────────────────────
async def send_expiry_reminders(app: Application):
    """Send reminders to users expiring in 3 days."""
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    soon = now + timedelta(days=3)

    async with SessionLocal() as db:
        result = await db.execute(
            select(User).where(
                User.telegram_id.is_not(None),
                User.deleted_at.is_(None),
                User.is_active == True,
                User.expires_at > now,
                User.expires_at <= soon,
            )
        )
        users = result.scalars().all()

    for user in users:
        days_left = (user.expires_at.replace(tzinfo=timezone.utc) - now).days
        try:
            await app.bot.send_message(
                chat_id=user.telegram_id,
                text=(
                    f"⚠️ *Subscription Expiring Soon*\n\n"
                    f"Your VPN subscription expires in *{days_left} day(s)*\\.\n"
                    "Please renew to avoid service interruption\\."
                ),
                parse_mode="MarkdownV2",
            )
        except Exception as e:
            logger.warning(f"Failed to send expiry reminder to {user.username}: {e}")


async def send_quota_warnings(app: Application):
    """Warn users who have used >90% of quota."""
    async with SessionLocal() as db:
        result = await db.execute(
            select(User).where(
                User.telegram_id.is_not(None),
                User.deleted_at.is_(None),
                User.is_active == True,
                User.quota_bytes > 0,
            )
        )
        users = result.scalars().all()

    for user in users:
        pct = user.bytes_used / user.quota_bytes * 100
        if pct >= 90:
            try:
                await app.bot.send_message(
                    chat_id=user.telegram_id,
                    text=(
                        f"⚠️ *Quota Warning*\n\n"
                        f"You have used *{pct:.0f}%* of your data quota\\.\n"
                        f"Used: {fmt_bytes(user.bytes_used)} / {fmt_bytes(user.quota_bytes)}"
                    ),
                    parse_mode="MarkdownV2",
                )
            except Exception as e:
                logger.warning(f"Failed to send quota warning to {user.username}: {e}")


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    app = Application.builder().token(BOT_TOKEN).build()

    # User commands
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("login", cmd_login))
    app.add_handler(CommandHandler("usage", cmd_usage))
    app.add_handler(CommandHandler("sub", cmd_sub))
    app.add_handler(CommandHandler("help", cmd_help))

    # Admin commands
    app.add_handler(CommandHandler("users", cmd_users))
    app.add_handler(CommandHandler("adduser", cmd_adduser))
    app.add_handler(CommandHandler("disable", cmd_disable))
    app.add_handler(CommandHandler("enable", cmd_enable))
    app.add_handler(CommandHandler("broadcast", cmd_broadcast))

    # Schedule notifications
    job_queue = app.job_queue
    job_queue.run_repeating(
        lambda ctx: asyncio.create_task(send_expiry_reminders(app)),
        interval=3600,   # every hour
        first=10,
    )
    job_queue.run_repeating(
        lambda ctx: asyncio.create_task(send_quota_warnings(app)),
        interval=3600,
        first=30,
    )

    logger.info("Bot started.")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
