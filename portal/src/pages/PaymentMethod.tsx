import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Shield, ArrowLeft } from 'lucide-react'

export default function PaymentMethod() {
  const { state } = useLocation()
  const navigate = useNavigate()

  const info = state as {
    user_id: string
    username: string
    plan: string
    amount_usdt: string
    wallet: string
    network: string
    note: string
  }

  useEffect(() => {
    if (!info?.user_id) navigate('/')
  }, [])

  if (!info?.user_id) return null

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
        <h1 className="text-2xl font-bold text-white text-center mb-1">Choose Payment Method</h1>
        <p className="text-gray-500 text-center text-sm mb-2">选择付款方式 · {info.plan}</p>
        <p className="text-center text-gray-600 text-xs mb-8">
          Account created for <span className="text-white font-medium">{info.username}</span>
        </p>

        <div className="space-y-4">
          {/* USDT */}
          <button
            onClick={() => navigate('/payment', { state: info })}
            className="w-full p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-brand-500/50 transition-all text-left group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#26a17b]/20 flex items-center justify-center flex-shrink-0 text-2xl">₮</div>
              <div className="flex-1">
                <p className="text-white font-semibold">USDT (TRC20)</p>
                <p className="text-gray-500 text-sm">Auto-detected · 自动确认</p>
              </div>
              <div className="text-right">
                <p className="text-white font-bold">${info.amount_usdt}</p>
                <p className="text-[#26a17b] text-xs">Recommended · 推荐</p>
              </div>
            </div>
          </button>

          {/* WeChat Pay */}
          <button
            onClick={() => navigate('/payment-cny', { state: info })}
            className="w-full p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-[#07C160]/50 transition-all text-left group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#07C160]/15 flex items-center justify-center flex-shrink-0 text-2xl">💚</div>
              <div className="flex-1">
                <p className="text-white font-semibold">WeChat Pay · 微信支付</p>
                <p className="text-gray-500 text-sm">Manual confirm · 人工确认</p>
              </div>
              <div className="text-right">
                <p className="text-white font-bold">${info.amount_usdt} USD</p>
                <p className="text-[#07C160] text-xs">USDT</p>
              </div>
            </div>
          </button>

          {/* Alipay */}
          <button
            onClick={() => navigate('/payment-cny', { state: { ...info, defaultMethod: 'alipay' } })}
            className="w-full p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-[#1677FF]/50 transition-all text-left group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#1677FF]/15 flex items-center justify-center flex-shrink-0 text-2xl">💙</div>
              <div className="flex-1">
                <p className="text-white font-semibold">Alipay · 支付宝</p>
                <p className="text-gray-500 text-sm">Manual confirm · 人工确认</p>
              </div>
              <div className="text-right">
                <p className="text-white font-bold">${info.amount_usdt} USD</p>
                <p className="text-[#1677FF] text-xs">USDT</p>
              </div>
            </div>
          </button>
        </div>

        <p className="text-center text-gray-600 text-xs mt-8">
          USDT payments are confirmed automatically · USDT付款自动确认<br />
          CNY payments are confirmed by admin within minutes · 人民币付款由管理员在几分钟内确认
        </p>
      </div>
    </div>
  )
}
