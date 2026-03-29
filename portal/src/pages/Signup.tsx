import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Check, ArrowLeft, Loader2 } from 'lucide-react'
import api from '../lib/api'

const PLAN_FEATURES = [
  '500 GB / month',
  'All servers included',
  'Auto monthly renewal',
  'iOS / Android / Windows',
]

export default function Signup() {
  const navigate = useNavigate()
  const [plans, setPlans] = useState<any[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<any>(null)
  const [username, setUsername] = useState('')
  const [telegramUsername, setTelegramUsername] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Load plans on mount
  useState(() => {
    api.get('/signup/plans').then(r => {
      setPlans(r.data)
      setLoadingPlans(false)
    }).catch(() => setLoadingPlans(false))
  })

  const handleSubmit = async () => {
    if (!username.trim()) { setError('Please enter a username'); return }
    if (!selectedPlan) { setError('Please select a plan'); return }
    setError('')
    setSubmitting(true)
    try {
      const res = await api.post('/signup', {
        username: username.trim(),
        plan_id: selectedPlan.id,
        telegram_username: telegramUsername.trim() || null,
      })
      navigate('/payment', { state: res.data })
    } catch (e: any) {
      const detail = e?.response?.data?.detail
      if (e?.response?.status === 409) setError('Username already taken, please choose another.')
      else setError(detail || 'Failed to create account. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const durationLabel: Record<number, string> = { 1: '1 Month · 一个月', 3: '3 Months · 三个月', 6: '6 Months · 六个月' }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-gray-400 hover:text-white transition">
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

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-10">
        <h1 className="text-3xl font-bold text-white text-center mb-2">Choose Your Plan</h1>
        <p className="text-gray-500 text-center mb-8">选择您的套餐</p>

        {/* Plans */}
        {loadingPlans ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {plans.map((p: any) => {
              const isSelected = selectedPlan?.id === p.id
              const popular = p.duration_months === 3
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlan(p)}
                  className={`relative rounded-2xl p-5 text-left border transition-all ${
                    isSelected
                      ? 'bg-brand-500/10 border-brand-500/60 ring-1 ring-brand-500/40'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                  }`}
                >
                  {popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-brand-500 text-white text-xs font-semibold">
                      Most Popular
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-gray-400 text-sm">{durationLabel[p.duration_months] ?? `${p.duration_months} months`}</span>
                    {isSelected && <Check className="w-4 h-4 text-brand-400" />}
                  </div>
                  <div className="text-2xl font-bold text-white mb-0.5">${p.price_usdt} <span className="text-sm font-normal text-gray-500">USDT</span></div>
                  <div className="text-gray-600 text-xs mb-4">≈ ¥{p.price_rmb} RMB</div>
                  <ul className="space-y-1.5">
                    {PLAN_FEATURES.map(f => (
                      <li key={f} className="flex items-center gap-2 text-xs text-gray-400">
                        <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </button>
              )
            })}
          </div>
        )}

        {/* Form */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <h2 className="text-white font-semibold">Account Details · 账户信息</h2>
          <div>
            <label className="text-gray-500 text-xs block mb-1.5">Username · 用户名</label>
            <input
              type="text"
              placeholder="e.g. john123"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 text-white border border-white/10 focus:outline-none focus:border-brand-500/60 transition placeholder-gray-600 text-sm"
            />
            <p className="text-gray-600 text-xs mt-1">Letters and numbers only, used to identify your account</p>
          </div>
          <div>
            <label className="text-gray-500 text-xs block mb-1.5">Telegram Username (optional) · Telegram用户名（可选）</label>
            <input
              type="text"
              placeholder="@yourusername"
              value={telegramUsername}
              onChange={e => setTelegramUsername(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 text-white border border-white/10 focus:outline-none focus:border-brand-500/60 transition placeholder-gray-600 text-sm"
            />
            <p className="text-gray-600 text-xs mt-1">We'll contact you here after payment is confirmed</p>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || !selectedPlan || !username.trim()}
            className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {submitting ? 'Creating account...' : 'Continue to Payment · 继续付款'}
          </button>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          Already have an account?{' '}
          <button onClick={() => navigate('/login')} className="text-brand-400 hover:underline">
            Login · 登录
          </button>
        </p>
      </div>
    </div>
  )
}
