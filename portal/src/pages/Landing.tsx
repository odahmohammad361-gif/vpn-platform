import { useNavigate } from 'react-router-dom'
import { Shield, Zap, Globe, Lock } from 'lucide-react'

const features = [
  {
    icon: <Zap className="w-6 h-6 text-brand-400" />,
    en: 'Ultra Fast',
    zh: '超高速度',
    desc_en: 'Optimized for China mobile & WiFi networks',
    desc_zh: '针对中国移动和WiFi网络优化',
  },
  {
    icon: <Shield className="w-6 h-6 text-brand-400" />,
    en: 'Secure',
    zh: '安全加密',
    desc_en: 'ChaCha20 military-grade encryption',
    desc_zh: 'ChaCha20军事级加密保护',
  },
  {
    icon: <Globe className="w-6 h-6 text-brand-400" />,
    en: 'Global Access',
    zh: '全球访问',
    desc_en: 'Access Google, YouTube, and more',
    desc_zh: '访问谷歌、YouTube等全球服务',
  },
  {
    icon: <Lock className="w-6 h-6 text-brand-400" />,
    en: 'No Logs',
    zh: '不记录日志',
    desc_en: 'Your privacy is our priority',
    desc_zh: '您的隐私是我们的首要任务',
  },
]

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">SayMyName97</span>
        </div>
        <button
          onClick={() => navigate('/login')}
          className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
        >
          Login · 登录
        </button>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-sm mb-6">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          All servers online · 所有服务器在线
        </div>

        <h1 className="text-4xl sm:text-6xl font-bold mb-4 bg-gradient-to-r from-white to-brand-400 bg-clip-text text-transparent">
          SayMyName97
        </h1>
        <p className="text-xl text-gray-400 mb-2">Fast & Secure VPN for China</p>
        <p className="text-lg text-gray-500 mb-10">专为中国用户打造的高速安全VPN</p>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => navigate('/login')}
            className="px-8 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-lg transition-colors"
          >
            Get Started · 开始使用
          </button>
        </div>
      </div>

      {/* Features */}
      <div className="px-6 pb-20">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f) => (
            <div
              key={f.en}
              className="p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-brand-500/30 transition-colors"
            >
              <div className="mb-3">{f.icon}</div>
              <div className="font-semibold text-white">{f.en}</div>
              <div className="text-sm text-gray-400 mb-2">{f.zh}</div>
              <div className="text-xs text-gray-500">{f.desc_en}</div>
              <div className="text-xs text-gray-600">{f.desc_zh}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-6 text-gray-600 text-sm border-t border-white/5">
        © 2025 SayMyName97 · All rights reserved
      </footer>
    </div>
  )
}
