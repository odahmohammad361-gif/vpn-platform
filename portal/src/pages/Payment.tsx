import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Shield, Copy, Check, Loader2, CheckCircle, ArrowLeft } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || ''

export default function Payment() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const [copied, setCopied] = useState<string | null>(null)
  const [status, setStatus] = useState<'pending' | 'paid'>('pending')
  const [checking, setChecking] = useState(false)

  const info = state as {
    user_id: string
    username: string
    plan: string
    wallet: string
    network: string
    amount_usdt: string
    note: string
  }

  useEffect(() => {
    if (!info?.user_id) navigate('/')
  }, [])

  useEffect(() => {
    if (!info?.user_id || status === 'paid') return
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/signup/status/${info.user_id}`)
        if (res.data.payment_status === 'paid') {
          setStatus('paid')
          clearInterval(interval)
          setTimeout(() => navigate('/login', { state: { token: res.data.subscription_token } }), 3000)
        }
      } catch {}
    }, 10000)
    return () => clearInterval(interval)
  }, [info?.user_id, status])

  const copy = (key: string, value: string) => {
    navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const checkNow = async () => {
    setChecking(true)
    try {
      const res = await axios.get(`${API}/signup/status/${info.user_id}`)
      if (res.data.payment_status === 'paid') {
        setStatus('paid')
        setTimeout(() => navigate('/login', { state: { token: res.data.subscription_token } }), 3000)
      }
    } catch {}
    setChecking(false)
  }

  if (!info?.user_id) return null

  if (status === 'paid') {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center px-4 text-center">
        <CheckCircle className="w-16 h-16 text-green-400 mb-4" />
        <h1 className="text-3xl font-bold text-white mb-2">Payment Confirmed!</h1>
        <p className="text-gray-400 mb-1">付款已确认！</p>
        <p className="text-gray-500 text-sm">Redirecting to your dashboard...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <button onClick={() => navigate('/signup')} className="flex items-center gap-2 text-gray-400 hover:text-white transition">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold tracking-tight">SayMyName97</span>
        </div>
        <div className="w-16" />
      </nav>

      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-10">
        <h1 className="text-2xl font-bold text-white text-center mb-1">Complete Payment</h1>
        <p className="text-gray-500 text-center text-sm mb-8">完成付款 · {info.plan}</p>

        {/* Amount */}
        <div className="bg-brand-500/10 border border-brand-500/30 rounded-2xl p-5 text-center mb-6">
          <p className="text-gray-400 text-sm mb-1">Send EXACTLY · 请发送精确金额</p>
          <div className="flex items-center justify-center gap-3">
            <span className="text-4xl font-bold text-white">{info.amount_usdt}</span>
            <span className="text-brand-400 font-semibold">USDT</span>
            <button onClick={() => copy('amount', info.amount_usdt)} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition">
              {copied === 'amount' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-gray-400" />}
            </button>
          </div>
          <p className="text-yellow-400/80 text-xs mt-2">⚠ The exact amount is how we identify your payment</p>
          <p className="text-yellow-400/60 text-xs">⚠ 精确金额用于识别您的付款</p>
        </div>

        {/* Network */}
        <div className="flex items-center justify-between px-5 py-3 bg-white/5 border border-white/10 rounded-xl mb-4">
          <span className="text-gray-500 text-sm">Network · 网络</span>
          <span className="text-white font-semibold">{info.network}</span>
        </div>

        {/* Wallet */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6">
          <p className="text-gray-500 text-xs mb-3">Wallet Address · 钱包地址</p>
          <div className="flex items-center gap-2 mb-4">
            <code className="flex-1 text-xs text-gray-300 bg-black/20 px-3 py-2 rounded-lg break-all">{info.wallet}</code>
            <button onClick={() => copy('wallet', info.wallet)} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition flex-shrink-0">
              {copied === 'wallet' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-gray-400" />}
            </button>
          </div>
          <div className="flex justify-center">
            <div className="bg-white p-3 rounded-xl">
              <QRCodeSVG value={info.wallet} size={160} />
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-yellow-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">Waiting for payment · 等待付款</span>
          </div>
          <p className="text-gray-600 text-xs">Auto-detected within 2–5 minutes after sending · 发送后2-5分钟内自动确认</p>
          <button
            onClick={checkNow}
            disabled={checking}
            className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Check Now · 立即检查
          </button>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          User ID: <span className="font-mono">{info.user_id}</span><br />
          Save this if you need support · 保存此ID以便联系客服
        </p>
      </div>
    </div>
  )
}
