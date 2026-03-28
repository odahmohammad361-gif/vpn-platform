import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Eye, EyeOff } from 'lucide-react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || ''

export default function Login() {
  const navigate = useNavigate()
  const [token, setToken] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await axios.get(`${API}/portal/me`, {
        headers: { 'X-Sub-Token': token.trim() },
      })
      localStorage.setItem('portal_token', token.trim())
      localStorage.setItem('portal_user', JSON.stringify(res.data))
      navigate('/dashboard')
    } catch {
      setError('Invalid token. Check your subscription URL. · 令牌无效，请检查您的订阅链接。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <span className="font-bold text-xl tracking-tight">SayMyName97</span>
      </div>

      <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-8">
        <h2 className="text-2xl font-bold text-white mb-1">Login · 登录</h2>
        <p className="text-gray-400 text-sm mb-6">
          Enter your subscription token to access your account.<br />
          <span className="text-gray-500">输入您的订阅令牌以访问您的账户。</span>
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Subscription Token · 订阅令牌
            </label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 pr-12 font-mono text-sm"
                required
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !token.trim()}
            className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
          >
            {loading ? 'Logging in... · 登录中...' : 'Login · 登录'}
          </button>
        </form>

        <p className="text-center text-gray-600 text-xs mt-6">
          Find your token in your subscription URL after <code className="text-gray-400">/sub/</code>
          <br />
          <span className="text-gray-700">在订阅链接 /sub/ 之后找到您的令牌</span>
        </p>
      </div>
    </div>
  )
}
