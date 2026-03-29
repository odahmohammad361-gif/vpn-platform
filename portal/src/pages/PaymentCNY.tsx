import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Shield, Check, Loader2, CheckCircle, ArrowLeft } from 'lucide-react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || ''

type Method = 'alipay' | 'wechat'

export default function PaymentCNY() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const [method, setMethod] = useState<Method>(info?.defaultMethod ?? 'wechat')
  const [notified, setNotified] = useState(false)
  const [notifying, setNotifying] = useState(false)
  const [status, setStatus] = useState<'pending' | 'paid'>('pending')

  const info = state as {
    user_id: string
    username: string
    plan: string
    amount_rmb: number
    defaultMethod?: Method
  }

  useEffect(() => {
    if (!info?.user_id) navigate('/')
  }, [])

  // Poll for admin confirmation
  useEffect(() => {
    if (!info?.user_id || status === 'paid') return
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/signup/status/${info.user_id}`)
        if (res.data.payment_status === 'paid') {
          setStatus('paid')
          clearInterval(interval)
          setTimeout(() => navigate('/login'), 3000)
        }
      } catch {}
    }, 10000)
    return () => clearInterval(interval)
  }, [info?.user_id, status])

  async function handleNotify() {
    setNotifying(true)
    try {
      await axios.post(`${API}/signup/notify-paid`, {
        user_id: info.user_id,
        method,
      })
      setNotified(true)
    } catch {}
    setNotifying(false)
  }

  if (!info?.user_id) return null

  if (status === 'paid') {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center px-4 text-center">
        <CheckCircle className="w-16 h-16 text-green-400 mb-4" />
        <h1 className="text-3xl font-bold text-white mb-2">Payment Confirmed!</h1>
        <p className="text-gray-400 mb-1">付款已确认！</p>
        <p className="text-gray-500 text-sm">Redirecting to login...</p>
      </div>
    )
  }

  const isWechat = method === 'wechat'

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <button onClick={() => navigate('/payment-method', { state })} className="flex items-center gap-2 text-gray-400 hover:text-white transition">
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
        <p className="text-gray-500 text-center text-sm mb-6">完成付款 · {info.plan}</p>

        {/* Method toggle */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setMethod('wechat')}
            className={`flex-1 py-3 rounded-xl font-medium text-sm transition-colors border ${
              isWechat
                ? 'bg-[#07C160]/15 border-[#07C160]/50 text-[#07C160]'
                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
            }`}
          >
            💚 WeChat Pay · 微信支付
          </button>
          <button
            onClick={() => setMethod('alipay')}
            className={`flex-1 py-3 rounded-xl font-medium text-sm transition-colors border ${
              !isWechat
                ? 'bg-[#1677FF]/15 border-[#1677FF]/50 text-[#1677FF]'
                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
            }`}
          >
            💙 Alipay · 支付宝
          </button>
        </div>

        {/* Amount */}
        <div className={`rounded-2xl p-5 text-center mb-6 border ${
          isWechat ? 'bg-[#07C160]/10 border-[#07C160]/30' : 'bg-[#1677FF]/10 border-[#1677FF]/30'
        }`}>
          <p className="text-gray-400 text-sm mb-1">Send exactly · 请转账精确金额</p>
          <div className="flex items-center justify-center gap-2">
            <span className="text-4xl font-bold text-white">¥{info.amount_rmb}</span>
            <span className={`font-semibold text-sm ${isWechat ? 'text-[#07C160]' : 'text-[#1677FF]'}`}>CNY</span>
          </div>
          <p className="text-yellow-400/70 text-xs mt-2">⚠ Use this exact amount · 请转账精确金额</p>
        </div>

        {/* QR Code */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6 flex flex-col items-center">
          <p className="text-gray-400 text-sm mb-4">
            {isWechat ? 'Scan with WeChat · 微信扫码支付' : 'Scan with Alipay · 支付宝扫码支付'}
          </p>
          {isWechat ? (
            <img src="/wechat-qr.jpg" alt="WeChat Pay QR" className="w-56 h-56 rounded-xl object-cover" />
          ) : (
            <img src="/alipay-qr.jpg" alt="Alipay QR" className="w-56 h-56 rounded-xl object-cover" />
          )}
          <p className="text-gray-500 text-xs mt-3 text-center">
            {isWechat ? 'ODAH SUHAIMAT · 奥达' : 'ODAH SUHAIMAT · 奥达'}
          </p>
        </div>

        {/* I've paid button */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
          {notified ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex items-center gap-2 text-green-400">
                <Check className="w-5 h-5" />
                <span className="font-medium">Notification sent! · 通知已发送！</span>
              </div>
              <p className="text-gray-500 text-xs">
                Admin will confirm your payment shortly · 管理员将很快确认您的付款
              </p>
              <div className="flex items-center gap-2 text-gray-500 text-xs mt-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Waiting for confirmation · 等待确认中...
              </div>
            </div>
          ) : (
            <>
              <p className="text-gray-400 text-sm text-center">After paying, tap the button below · 付款后点击下方按钮</p>
              <button
                onClick={handleNotify}
                disabled={notifying}
                className={`w-full py-3 rounded-xl font-semibold text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${
                  isWechat ? 'bg-[#07C160] hover:bg-[#06ad56]' : 'bg-[#1677FF] hover:bg-[#1260d4]'
                }`}
              >
                {notifying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                I've Paid · 我已付款
              </button>
            </>
          )}
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          Need help? Contact us on Telegram · 需要帮助？请联系Telegram客服<br />
          User ID: <span className="font-mono">{info.user_id}</span>
        </p>
      </div>
    </div>
  )
}
