import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Shield, LogOut, Copy, Check, MessageCircle, Users } from 'lucide-react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || ''

interface UserInfo {
  username: string
  is_active: boolean
  bytes_used: number
  quota_bytes: number
  expires_at: string | null
  subscription_token: string
}

function fmtBytes(b: number) {
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`
  if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`
  return `${b} B`
}

function fmtExpiry(expires_at: string | null) {
  if (!expires_at) return { text: 'No expiry · 无过期', color: 'text-gray-400', urgent: false }
  const now = new Date()
  const exp = new Date(expires_at)
  const days = Math.ceil((exp.getTime() - now.getTime()) / 86400000)
  if (days < 0) return { text: 'Expired · 已过期', color: 'text-red-400', urgent: true }
  if (days <= 3) return { text: `${days} days left · 剩余${days}天`, color: 'text-orange-400', urgent: true }
  return { text: `${days} days left · 剩余${days}天 (${exp.toLocaleDateString()})`, color: 'text-green-400', urgent: false }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    } else {
      // HTTP fallback
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
  return (
    <button onClick={copy} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  )
}

interface SubLink {
  label_en: string
  label_zh: string
  url: string
}

interface SubSection {
  id: string
  title_en: string
  title_zh: string
  icon: string
  links: SubLink[]
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [qrTarget, setQrTarget] = useState<string | null>(null)
  const [activePlatform, setActivePlatform] = useState('ios')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('portal_token')
    if (!token) { navigate('/login'); return }

    axios.get(`${API}/portal/me`, { headers: { 'X-Sub-Token': token } })
      .then(r => setUser(r.data))
      .catch(() => { localStorage.clear(); navigate('/login') })
      .finally(() => setLoading(false))
  }, [navigate])

  function logout() {
    localStorage.clear()
    navigate('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return null

  const base = `${window.location.protocol}//${window.location.hostname}`
  const token = user.subscription_token

  const raw   = `${base}/sub/${token}`
  const clash = `${base}/sub/${token}?format=clash`
  const v2ray = `${base}/sub/${token}?format=v2rayng`
  const surge = `${base}/sub/${token}?format=surge`
  const sbox  = `${base}/sub/${token}?format=singbox`

  const subSections: SubSection[] = [
    {
      id: 'ios',
      title_en: 'iOS / iPhone / iPad',
      title_zh: 'iOS 苹果手机/平板',
      icon: '📱',
      links: [
        { label_en: 'Shadowrocket', label_zh: 'Shadowrocket（小火箭）', url: raw },
        { label_en: 'Quantumult X', label_zh: 'Quantumult X', url: raw },
        { label_en: 'Surge', label_zh: 'Surge', url: surge },
        { label_en: 'Stash (Clash)', label_zh: 'Stash（Clash内核）', url: clash },
        { label_en: 'sing-box (SFA)', label_zh: 'sing-box / SFA', url: sbox },
      ],
    },
    {
      id: 'android',
      title_en: 'Android',
      title_zh: '安卓手机',
      icon: '🤖',
      links: [
        { label_en: 'v2rayNG', label_zh: 'v2rayNG', url: v2ray },
        { label_en: 'Clash Meta / FlClash', label_zh: 'Clash Meta / FlClash', url: clash },
        { label_en: 'sing-box (SFM)', label_zh: 'sing-box / SFM', url: sbox },
        { label_en: 'NekoBox', label_zh: 'NekoBox', url: clash },
        { label_en: 'Hiddify', label_zh: 'Hiddify', url: clash },
      ],
    },
    {
      id: 'windows',
      title_en: 'Windows',
      title_zh: 'Windows 电脑',
      icon: '🖥',
      links: [
        { label_en: 'Clash Verge Rev', label_zh: 'Clash Verge Rev', url: clash },
        { label_en: 'Hiddify', label_zh: 'Hiddify', url: clash },
        { label_en: 'sing-box', label_zh: 'sing-box', url: sbox },
        { label_en: 'NekoRay / NekoBox', label_zh: 'NekoRay / NekoBox', url: v2ray },
        { label_en: 'v2rayN', label_zh: 'v2rayN', url: v2ray },
        { label_en: 'Shadowsocks-Windows', label_zh: 'Shadowsocks Windows 客户端', url: raw },
      ],
    },
    {
      id: 'mac',
      title_en: 'macOS',
      title_zh: 'Mac 电脑',
      icon: '🍎',
      links: [
        { label_en: 'Shadowrocket (Mac)', label_zh: 'Shadowrocket（Mac）', url: raw },
        { label_en: 'Surge (macOS)', label_zh: 'Surge（macOS）', url: surge },
        { label_en: 'Clash Verge Rev', label_zh: 'Clash Verge Rev', url: clash },
        { label_en: 'ClashX Meta', label_zh: 'ClashX Meta', url: clash },
        { label_en: 'sing-box', label_zh: 'sing-box', url: sbox },
        { label_en: 'Hiddify', label_zh: 'Hiddify', url: clash },
      ],
    },
    {
      id: 'linux',
      title_en: 'Linux',
      title_zh: 'Linux 系统',
      icon: '🐧',
      links: [
        { label_en: 'Clash Meta (CLI)', label_zh: 'Clash Meta 命令行', url: clash },
        { label_en: 'sing-box (CLI)', label_zh: 'sing-box 命令行', url: sbox },
        { label_en: 'NekoRay', label_zh: 'NekoRay', url: v2ray },
        { label_en: 'v2rayA (Web UI)', label_zh: 'v2rayA（网页控制台）', url: clash },
        { label_en: 'Hiddify', label_zh: 'Hiddify', url: clash },
        { label_en: 'Shadowsocks-libev', label_zh: 'Shadowsocks-libev', url: raw },
      ],
    },
  ]

  const quota = user.quota_bytes
  const used = user.bytes_used
  const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0
  const expiry = fmtExpiry(user.expires_at)

  return (
    <div className="min-h-screen bg-[#0a0f1e]">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold tracking-tight">SayMyName97</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm">{user.username}</span>
          <button onClick={logout} className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Status Card */}
        <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Account Status · 账户状态</h2>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${user.is_active ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
              {user.is_active ? 'Active · 活跃' : 'Disabled · 已禁用'}
            </span>
          </div>

          {/* Usage bar */}
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Data Usage · 流量使用</span>
              <span className="text-white font-mono">
                {fmtBytes(used)} / {quota > 0 ? fmtBytes(quota) : '∞'}
              </span>
            </div>
            {quota > 0 && (
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-orange-500' : 'bg-brand-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>

          {/* Expiry */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">Expiry · 到期时间:</span>
            <span className={expiry.color}>{expiry.text}</span>
          </div>

          {expiry.urgent && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs">
              ⚠️ Please renew your subscription soon. · 请尽快续订您的套餐。
            </div>
          )}
        </div>

        {/* Subscription Links */}
        <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
          <div className="px-6 pt-6 pb-4">
            <h2 className="font-semibold text-white">Subscription Links · 订阅链接</h2>
            <p className="text-gray-500 text-xs mt-1">Pick your platform · 选择你的设备</p>
          </div>

          {/* Platform tab buttons */}
          <div className="px-6 pb-4 flex flex-wrap gap-2">
            {subSections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActivePlatform(s.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  activePlatform === s.id
                    ? 'bg-brand-500 text-white'
                    : 'bg-white/10 text-gray-400 hover:bg-white/15 hover:text-white'
                }`}
              >
                <span>{s.icon}</span>
                <span>{s.title_en.split(' /')[0]}</span>
              </button>
            ))}
          </div>

          {/* Active platform app list */}
          {subSections.filter(s => s.id === activePlatform).map((section) => (
            <div key={section.id} className="px-6 pb-6 space-y-2">
              <p className="text-xs text-gray-500 mb-3">{section.title_zh}</p>
              {section.links.map((link) => {
                const key = `${section.id}-${link.label_en}`
                return (
                  <div key={key} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                    <div>
                      <div className="text-sm text-white font-medium">{link.label_en}</div>
                      <div className="text-xs text-gray-500">{link.label_zh}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setQrTarget(qrTarget === key ? null : key)}
                        className="px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors text-xs"
                      >
                        QR
                      </button>
                      <CopyButton text={link.url} />
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          {/* QR modal */}
          {qrTarget && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
              onClick={() => setQrTarget(null)}
            >
              <div className="bg-white rounded-2xl p-6 flex flex-col items-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <QRCodeSVG value={
                  subSections.flatMap(s => s.links.map(l => ({ key: `${s.id}-${l.label_en}`, url: l.url })))
                    .find(x => x.key === qrTarget)?.url ?? ''
                } size={220} />
                <p className="text-gray-600 text-sm mt-3 font-medium">
                  {subSections.flatMap(s => s.links.map(l => ({ key: `${s.id}-${l.label_en}`, label: l.label_en }))).find(x => x.key === qrTarget)?.label}
                </p>
                <p className="text-xs text-gray-400 mt-1 text-center">Scan with your VPN app · 用VPN应用扫描</p>
                <button onClick={() => setQrTarget(null)} className="mt-4 text-xs text-gray-400 hover:text-gray-700 underline">Close · 关闭</button>
              </div>
            </div>
          )}
        </div>

        {/* Contact Support */}
        <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
          <h2 className="font-semibold text-white mb-1">Contact Support · 联系客服</h2>
          <p className="text-gray-500 text-xs mb-4">Need help? Reach us via Telegram or WeChat · 需要帮助？通过Telegram或微信联系我们</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Telegram Bot */}
            <a
              href="https://t.me/SayMyName97VPN_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-xl bg-[#229ED9]/10 border border-[#229ED9]/30 hover:bg-[#229ED9]/20 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-[#229ED9]/20 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-5 h-5 text-[#229ED9]" />
              </div>
              <div>
                <p className="text-white text-sm font-medium">Telegram Bot</p>
                <p className="text-[#229ED9] text-xs">@SayMyName97VPN_bot</p>
              </div>
            </a>

            {/* Telegram Channel */}
            <a
              href="https://t.me/SayMyNameVPN"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-xl bg-[#229ED9]/10 border border-[#229ED9]/30 hover:bg-[#229ED9]/20 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-[#229ED9]/20 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-[#229ED9]" />
              </div>
              <div>
                <p className="text-white text-sm font-medium">Telegram Channel</p>
                <p className="text-[#229ED9] text-xs">@SayMyNameVPN</p>
              </div>
            </a>

            {/* WeChat */}
            <button
              onClick={() => {
                const el = document.getElementById('wechat-qr')
                if (el) el.classList.toggle('hidden')
              }}
              className="flex items-center gap-3 p-4 rounded-xl bg-[#07C160]/10 border border-[#07C160]/30 hover:bg-[#07C160]/20 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-[#07C160]/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[#07C160]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.11.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.49.49 0 0 1 .177-.554C23.024 18.48 24 16.97 24 15.2c0-3.4-3.162-6.337-7.062-6.342zm-3.85 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm5.306 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
                </svg>
              </div>
              <div>
                <p className="text-white text-sm font-medium">WeChat · 微信</p>
                <p className="text-[#07C160] text-xs">Scan QR · 扫码添加</p>
              </div>
            </button>
          </div>

          {/* WeChat QR Code - hidden by default */}
          <div id="wechat-qr" className="hidden mt-4 flex flex-col items-center p-5 rounded-xl bg-white/5 border border-[#07C160]/20">
            <p className="text-gray-400 text-sm mb-3">Scan to add on WeChat · 扫码添加微信</p>
            <img src="/wechat-qr.jpg" alt="WeChat QR" className="w-56 h-56 rounded-xl object-cover" />
            <p className="text-gray-500 text-xs mt-2">ODAH SUHAIMAT · 奥达</p>
          </div>
        </div>

        {/* Setup Guide */}
        <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
          <h2 className="font-semibold text-white mb-4">Setup Guide · 使用教程</h2>
          <div className="space-y-3 text-sm text-gray-400">
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center text-xs flex-shrink-0">1</span>
              <div>
                <p className="text-white">Download your VPN app · 下载VPN应用</p>
                <p className="text-gray-500 text-xs mt-0.5">iPhone: Shadowrocket · Android: v2rayNG / Clash Meta · Windows/Mac: Clash Verge Rev · Linux: Clash Meta CLI</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center text-xs flex-shrink-0">2</span>
              <div>
                <p className="text-white">Copy your subscription link · 复制订阅链接</p>
                <p className="text-gray-500 text-xs mt-0.5">Tap the copy icon next to your app above · 点击上方对应应用的复制图标</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center text-xs flex-shrink-0">3</span>
              <div>
                <p className="text-white">Add as subscription in the app · 在应用中添加订阅</p>
                <p className="text-gray-500 text-xs mt-0.5">Paste the link and tap update · 粘贴链接并点击更新</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center text-xs flex-shrink-0">4</span>
              <div>
                <p className="text-white">Connect and enjoy · 连接并享用</p>
                <p className="text-gray-500 text-xs mt-0.5">Select a server and connect · 选择服务器并连接</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
