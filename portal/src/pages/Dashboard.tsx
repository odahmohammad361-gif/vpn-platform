import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Shield, LogOut, Copy, Check, Smartphone, Download } from 'lucide-react'
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
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
  hint: string
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [qrTarget, setQrTarget] = useState<string | null>(null)
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

  const base = `${window.location.protocol}//${window.location.hostname}:8080`
  const token = user.subscription_token

  const subLinks: SubLink[] = [
    { label_en: 'Shadowrocket (iPhone)', label_zh: 'Shadowrocket（iPhone）', url: `${base}/sub/${token}`, hint: 'iOS' },
    { label_en: 'Clash Meta (Android)', label_zh: 'Clash Meta（安卓）', url: `${base}/sub/${token}?format=clash`, hint: 'Android' },
    { label_en: 'v2rayNG (Android)', label_zh: 'v2rayNG（安卓）', url: `${base}/sub/${token}?format=v2rayng`, hint: 'Android' },
    { label_en: 'Surge / Shadowrocket conf', label_zh: 'Surge / Shadowrocket 配置', url: `${base}/sub/${token}?format=surge`, hint: 'iOS/Mac' },
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
        <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
          <h2 className="font-semibold text-white mb-4">Subscription Links · 订阅链接</h2>
          <div className="space-y-3">
            {subLinks.map((link) => (
              <div key={link.url} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                <div>
                  <div className="text-sm text-white flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-brand-400" />
                    {link.label_en}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{link.label_zh}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setQrTarget(qrTarget === link.url ? null : link.url)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors text-xs px-2"
                  >
                    QR
                  </button>
                  <CopyButton text={link.url} />
                  <a
                    href={link.url}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    title="Open link"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* QR Code */}
          {qrTarget && (
            <div className="mt-4 flex flex-col items-center p-4 rounded-xl bg-white border border-white/10">
              <QRCodeSVG value={qrTarget} size={200} />
              <p className="text-xs text-gray-500 mt-2 text-center">
                Scan with your VPN app · 用VPN应用扫描
              </p>
            </div>
          )}
        </div>

        {/* Setup Guide */}
        <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
          <h2 className="font-semibold text-white mb-4">Setup Guide · 使用教程</h2>
          <div className="space-y-3 text-sm text-gray-400">
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center text-xs flex-shrink-0">1</span>
              <div>
                <p className="text-white">Download your VPN app · 下载VPN应用</p>
                <p className="text-gray-500 text-xs mt-0.5">iPhone: Shadowrocket · Android: Clash Meta or v2rayNG</p>
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
