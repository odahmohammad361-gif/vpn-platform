import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Check, ArrowLeft, Loader2, Eye, EyeOff } from 'lucide-react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || ''

const PLAN_FEATURES = [
  '500 GB / month · 每月500GB',
  'All servers included · 包含所有服务器',
  'Auto monthly renewal · 自动每月重置',
  'iOS / Android / Windows',
]

export default function Signup() {
  const navigate = useNavigate()
  const [plans, setPlans] = useState<any[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<any>(null)

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [telegramUsername, setTelegramUsername] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState('')

  useEffect(() => {
    axios.get(`${API}/signup/plans`).then((r: any) => {
      setPlans(r.data)
      setLoadingPlans(false)
    }).catch(() => setLoadingPlans(false))
  }, [])

  const validate = () => {
    const e: Record<string, string> = {}
    if (!username.trim()) e.username = 'Username is required · 请输入用户名'
    else if (!/^[a-zA-Z0-9_]{3,32}$/.test(username.trim())) e.username = '3–32 characters, letters/numbers/underscore only · 仅限字母数字下划线'
    if (!email.trim()) e.email = 'Email is required · 请输入邮箱'
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) e.email = 'Invalid email address · 邮箱格式无效'
    if (!password) e.password = 'Password is required · 请输入密码'
    else if (password.length < 8) e.password = 'At least 8 characters · 至少8个字符'
    if (!confirmPassword) e.confirmPassword = 'Please confirm your password · 请确认密码'
    else if (password !== confirmPassword) e.confirmPassword = 'Passwords do not match · 两次密码不一致'
    if (!selectedPlan) e.plan = 'Please select a plan · 请选择套餐'
    return e
  }

  const handleSubmit = async () => {
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length > 0) return
    setApiError('')
    setSubmitting(true)
    try {
      const res = await axios.post(`${API}/signup`, {
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password,
        plan_id: selectedPlan.id,
        telegram_username: telegramUsername.trim() || null,
      })
      navigate('/payment', { state: res.data })
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      if (err?.response?.status === 409) setApiError(detail || 'Username or email already taken · 用户名或邮箱已被注册')
      else if (err?.response?.status === 422) {
        const errs = err?.response?.data?.detail
        if (Array.isArray(errs)) setApiError(errs.map((e: any) => e.msg).join(', '))
        else setApiError(detail || 'Validation error')
      }
      else setApiError('Failed to create account, please try again · 创建账户失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = (field: string) =>
    `w-full px-4 py-2.5 rounded-xl bg-white/5 text-white border focus:outline-none focus:border-brand-500/60 transition placeholder-gray-600 text-sm ${
      errors[field] ? 'border-red-500/60' : 'border-white/10'
    }`

  const durationLabel: Record<number, string> = { 1: '1 Month · 一个月', 3: '3 Months · 三个月', 6: '6 Months · 六个月' }

  const passwordStrength = (p: string) => {
    if (!p) return null
    if (p.length < 8) return { label: 'Too short · 太短', color: 'bg-red-500', width: '25%' }
    if (p.length < 10) return { label: 'Weak · 弱', color: 'bg-orange-500', width: '50%' }
    if (/[A-Z]/.test(p) && /[0-9]/.test(p)) return { label: 'Strong · 强', color: 'bg-green-500', width: '100%' }
    return { label: 'Medium · 中', color: 'bg-yellow-500', width: '75%' }
  }
  const strength = passwordStrength(password)

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
        <h1 className="text-3xl font-bold text-white text-center mb-2">Create Account</h1>
        <p className="text-gray-500 text-center mb-8">创建您的账户 · Choose a plan and sign up</p>

        {/* Plans */}
        {loadingPlans ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-brand-400 animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {plans.map((p: any) => {
              const isSelected = selectedPlan?.id === p.id
              const popular = p.duration_months === 3
              return (
                <button key={p.id} onClick={() => { setSelectedPlan(p); setErrors({ ...errors, plan: '' }) }}
                  className={`relative rounded-2xl p-5 text-left border transition-all ${
                    isSelected ? 'bg-brand-500/10 border-brand-500/60 ring-1 ring-brand-500/40'
                    : 'bg-white/5 border-white/10 hover:border-white/20'
                  }`}
                >
                  {popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-brand-500 text-white text-xs font-semibold whitespace-nowrap">
                      Most Popular · 最受欢迎
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-gray-400 text-sm">{durationLabel[p.duration_months] ?? `${p.duration_months} months`}</span>
                    {isSelected && <Check className="w-4 h-4 text-brand-400" />}
                  </div>
                  <div className="text-2xl font-bold text-white mb-0.5">${p.price_usdt} <span className="text-sm font-normal text-gray-500">USDT</span></div>
                  <div className="text-gray-600 text-xs mb-4">≈ ¥{p.price_rmb} RMB</div>
                  <ul className="space-y-1.5">
                    {PLAN_FEATURES.map((f: string) => (
                      <li key={f} className="flex items-center gap-2 text-xs text-gray-400">
                        <Check className="w-3 h-3 text-green-400 flex-shrink-0" />{f}
                      </li>
                    ))}
                  </ul>
                </button>
              )
            })}
          </div>
        )}
        {errors.plan && <p className="text-red-400 text-xs mb-4 text-center">{errors.plan}</p>}

        {/* Form */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <h2 className="text-white font-semibold">Account Details · 账户信息</h2>

          {/* Username */}
          <div>
            <label className="text-gray-500 text-xs block mb-1.5">Username · 用户名 <span className="text-red-400">*</span></label>
            <input type="text" placeholder="e.g. john123" value={username}
              onChange={(e: any) => { setUsername(e.target.value); setErrors({ ...errors, username: '' }) }}
              className={inputClass('username')} />
            {errors.username ? <p className="text-red-400 text-xs mt-1">{errors.username}</p>
              : <p className="text-gray-600 text-xs mt-1">3–32 characters, letters/numbers/underscore · 字母数字下划线</p>}
          </div>

          {/* Email */}
          <div>
            <label className="text-gray-500 text-xs block mb-1.5">Email · 邮箱 <span className="text-red-400">*</span></label>
            <input type="email" placeholder="you@example.com" value={email}
              onChange={(e: any) => { setEmail(e.target.value); setErrors({ ...errors, email: '' }) }}
              className={inputClass('email')} />
            {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
          </div>

          {/* Password */}
          <div>
            <label className="text-gray-500 text-xs block mb-1.5">Password · 密码 <span className="text-red-400">*</span></label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} placeholder="Min. 8 characters · 至少8个字符"
                value={password}
                onChange={(e: any) => { setPassword(e.target.value); setErrors({ ...errors, password: '' }) }}
                className={inputClass('password') + ' pr-10'} />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {strength && (
              <div className="mt-1.5 space-y-1">
                <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${strength.color}`} style={{ width: strength.width }} />
                </div>
                <p className="text-xs text-gray-500">{strength.label}</p>
              </div>
            )}
            {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="text-gray-500 text-xs block mb-1.5">Confirm Password · 确认密码 <span className="text-red-400">*</span></label>
            <div className="relative">
              <input type={showConfirm ? 'text' : 'password'} placeholder="Re-enter your password · 再次输入密码"
                value={confirmPassword}
                onChange={(e: any) => { setConfirmPassword(e.target.value); setErrors({ ...errors, confirmPassword: '' }) }}
                className={inputClass('confirmPassword') + ' pr-10'} />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmPassword && password === confirmPassword && (
              <p className="text-green-400 text-xs mt-1 flex items-center gap-1"><Check className="w-3 h-3" /> Passwords match · 密码匹配</p>
            )}
            {errors.confirmPassword && <p className="text-red-400 text-xs mt-1">{errors.confirmPassword}</p>}
          </div>

          {/* Telegram (optional) */}
          <div>
            <label className="text-gray-500 text-xs block mb-1.5">Telegram Username (optional) · Telegram用户名（可选）</label>
            <input type="text" placeholder="@yourusername" value={telegramUsername}
              onChange={(e: any) => setTelegramUsername(e.target.value)}
              className={inputClass('telegram')} />
            <p className="text-gray-600 text-xs mt-1">We'll notify you here after payment confirmation · 付款确认后我们会在此通知您</p>
          </div>

          {apiError && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {apiError}
            </div>
          )}

          <button onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {submitting ? 'Creating account... · 创建中...' : 'Continue to Payment · 继续付款'}
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
