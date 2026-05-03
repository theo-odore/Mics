import { useState } from 'react'
import { supabase, supabaseConfigured } from './supabase.js'

export default function AuthPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const authUnavailable = !supabaseConfigured

  const handleGoogleSignIn = async () => {
    if (authUnavailable) {
      setError('Supabase is not configured for this environment.')
      return
    }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  const handleEmailAuth = async (e) => {
    e.preventDefault()
    if (authUnavailable) {
      setError('Supabase is not configured for this environment.')
      return
    }
    setLoading(true)
    setError('')
    setMsg('')
    
    if (isSignUp) {
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
      })
      if (error) setError(error.message)
      else if (data?.user?.identities?.length === 0) setError("User already exists")
      else setMsg("Check your email for the confirmation link!")
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) setError(error.message)
    }
    setLoading(false)
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    if (authUnavailable) {
      setError('Supabase is not configured for this environment.')
      return
    }
    if (!email) {
      setError("Please enter your email address first")
      return
    }
    setLoading(true)
    setError('')
    setMsg('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) setError(error.message)
    else setMsg("Password reset email sent!")
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0c] flex flex-col font-inter text-white">
      <div className="flex-1 flex flex-col justify-center items-center px-6">
        <div className="w-full max-w-[340px]">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-xl font-bold mb-2">{isSignUp ? 'Create an account' : 'Welcome to Mics'}</h1>
            <p className="text-[#71717a] text-sm">{isSignUp ? 'Sign up to continue' : 'Sign in to continue'}</p>
            {authUnavailable && (
              <p className="text-amber-400 text-xs mt-2">Auth is disabled because Supabase env vars are missing.</p>
            )}
          </div>

          {/* Google Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading || authUnavailable}
            className="w-full bg-white text-black font-medium text-sm py-3.5 rounded-3xl flex items-center justify-center gap-3 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-gray-200 border-t-black rounded-full animate-spin shrink-0" />
            ) : (
              <div className="w-5 h-5 bg-[#171717] rounded flex items-center justify-center">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff"/>
                </svg>
              </div>
            )}
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-4 my-8">
            <div className="flex-1 h-px bg-[#27272a]"></div>
            <span className="text-[#52525b] text-[13px] font-medium tracking-wide">OR</span>
            <div className="flex-1 h-px bg-[#27272a]"></div>
          </div>

          {/* Form */}
          <form className="space-y-4" onSubmit={handleEmailAuth}>
            <div>
              <label className="block text-[#a1a1aa] text-sm mb-2">Email</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="name@company.com" 
                className="w-full bg-[#27272a] text-white border-none rounded-xl px-4 py-3 placeholder:text-[#52525b] focus:ring-1 focus:ring-white outline-none text-sm transition-all"
              />
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-[#a1a1aa] text-sm">Password</label>
                {!isSignUp && (
                  <button type="button" onClick={handleResetPassword} className="text-[#22c55e] text-sm font-medium hover:text-[#16a34a] transition-colors">Forgot password?</button>
                )}
              </div>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••" 
                className="w-full bg-[#27272a] text-white border-none rounded-xl px-4 py-3 placeholder:text-[#52525b] focus:ring-1 focus:ring-white outline-none text-sm transition-all tracking-widest"
              />
            </div>

            {!isSignUp && (
              <div className="flex items-center gap-3 pt-2">
                <input 
                  type="checkbox" 
                  id="remember" 
                  className="w-4 h-4 rounded border-none bg-[#27272a] text-[#4f46e5] focus:ring-0 focus:ring-offset-0 cursor-pointer appearance-none checked:bg-[#4f46e5] checked:relative checked:after:content-['✓'] checked:after:absolute checked:after:text-white checked:after:text-[10px] checked:after:font-bold checked:after:left-[3px] checked:after:top-[1px]"
                />
                <label htmlFor="remember" className="text-[#a1a1aa] text-sm cursor-pointer select-none">Remember me</label>
              </div>
            )}

            {error && (
              <div className="text-red-400 text-sm font-medium pt-2">
                {error}
              </div>
            )}
            {msg && (
              <div className="text-[#22c55e] text-sm font-medium pt-2">
                {msg}
              </div>
            )}

            <div className="pt-4">
              <button 
                type="submit"
                disabled={loading || authUnavailable}
                className="w-full bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold text-sm py-3.5 rounded-3xl transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50"
              >
                {loading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Sign In'}
              </button>
            </div>
          </form>

          <p className="text-center mt-8 text-sm text-[#71717a]">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(''); setMsg('') }} className="text-white font-medium hover:underline ml-1">
              {isSignUp ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="pb-8 flex justify-center gap-6 text-[#3f3f46] text-[13px] font-medium">
        <a href="#" className="hover:text-[#a1a1aa] transition-colors">Privacy Policy</a>
        <a href="#" className="hover:text-[#a1a1aa] transition-colors">Terms of Service</a>
      </div>
    </div>
  )
}

