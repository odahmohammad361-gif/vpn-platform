import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Eye, EyeOff } from 'lucide-react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || ''

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // Step 1: login with email/password to get subscription token
      const loginRes = await axios.post(`${API}/portal/login`, {
        email: email.trim().toLowerCase(),
        password,
      })
      const token = loginRes.data.subscription_token

      // Step 2: fetch full user info using token
      const meRes = await axios.get(`${API}/portal/me`, {
        headers: { 'X-Sub-Token': token },
      })
      localStorage.setItem('portal_token', token)
      localStorage.setItem('portal_user', JSON.stringify(meRes.data))
      navigate('/dashboard')
    } catch (err: any) {
      const status = err?.response?.status
      const detail = err?.response?.data?.detail
      if (status === 403 && detail === 'payment_pending') {
        setError('Your payment is still pending. Please complete payment or contact support. · 您的付款尚未确认，请完成付款或联系客服。')
      } else if (status === 401) {
        setError('Invalid email or password. · 邮箱或密码错误。')
      } else if (status === 403) {
        setError(`Account disabled. · 账户已被禁用。`)
      } else {
        setError('Login failed, please try again. · 登录失败，请重试。')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center px-4">
      <div className="flex items-center gap-2 mb-8">
        <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <span className="font-bold text-xl tracking-tight">SayMyName97</span>
      </div>

      <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-8">
        <h2 className="text-2xl font-bold text-white mb-1">Login · 登录</h2>
        <p className="text-gray-500 text-sm mb-6">Sign in with your email and password · 使用邮箱和密码登录</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email · 邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Password · 密码</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password · 您的密码"
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 pr-12 text-sm"
                required
              />
              <button type="button" onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading || !email.trim() || !password}
            className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors">
            {loading ? 'Logging in... · 登录中...' : 'Login · 登录'}
          </button>
        </form>

        <p className="text-center text-gray-600 text-xs mt-6">
          Don't have an account?{' '}
          <button onClick={() => navigate('/signup')} className="text-brand-400 hover:underline">
            Sign up · 注册
          </button>
        </p>
      </div>
    </div>
  )
}
