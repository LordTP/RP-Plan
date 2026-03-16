'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Eye, EyeOff } from 'lucide-react';
import { authApi, getErrorMessage } from '@/lib/api';
import { useStore } from '@/store/useStore';

type LoginType = 'internal' | 'supplier';

export default function LoginPage() {
  const router = useRouter();
  const { setUser, isAuthenticated } = useStore();
  const [loginType, setLoginType] = useState<LoginType>('internal');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token && isAuthenticated) {
      window.location.href = '/dashboard';
    }
  }, [isAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password');
      return;
    }

    setIsLoading(true);

    try {
      const response = await authApi.login(username, password);
      localStorage.setItem('access_token', response.access_token);
      setUser(response.user);
      toast.success('Login successful');
      window.location.href = '/dashboard';
    } catch (error: any) {
      const message = getErrorMessage(error);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Panel - Brand */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gray-900 flex-col justify-between p-12 overflow-hidden">
        {/* Decorative accent blocks */}
        <div className="absolute bottom-0 left-0 w-full h-[45%]">
          <div className="absolute bottom-0 left-0 w-[55%] h-full bg-primary-400/5" />
          <div className="absolute bottom-0 left-0 w-[40%] h-[70%] bg-primary-500/10" />
          <div className="absolute bottom-0 right-0 w-[50%] h-[85%] bg-teal-400/5" />
          <div className="absolute bottom-0 right-0 w-[50%] h-[55%] bg-primary-300/5" />
          <div className="absolute bottom-0 right-0 w-[50%] h-[30%] bg-teal-500/10" />
          <div className="absolute bottom-0 right-[10%] w-[40%] h-[40%] bg-primary-400/8" />
        </div>

        {/* Top content */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <img src="/sourcelab-logo.png" alt="Source Lab" className="h-12" />
          </div>
        </div>

        {/* Center content */}
        <div className="relative z-10 flex flex-col gap-6">
          <h1 className="text-6xl xl:text-7xl font-bold text-white tracking-tight leading-[1.05]">
            CRITICAL
            <br />
            <span className="text-primary-400">PATH</span>
          </h1>
          <div className="w-16 h-1 bg-primary-500" />
          <p className="text-gray-300/70 text-lg font-light tracking-wide max-w-md">
            Purchase Order Management
          </p>
          <p className="text-gray-400/50 text-sm font-light leading-relaxed max-w-sm">
            Streamlining supply chain collaboration between internal teams and factory partners worldwide.
          </p>
        </div>

        {/* Bottom content */}
        <div className="relative z-10">
          <p className="text-gray-500/50 text-xs tracking-wide">
            &copy; {new Date().getFullYear()} Source Lab. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center bg-gray-50 p-6 sm:p-12">
        <div className="w-full max-w-md animate-fade-in-up">
          {/* Mobile brand header */}
          <div className="lg:hidden mb-10">
            <img src="/sourcelab-logo.png" alt="Source Lab" className="h-10 mb-4" />
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
              CRITICAL <span className="text-primary-500">PATH</span>
            </h1>
          </div>

          {/* Welcome text */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">
              Welcome back
            </h2>
            <p className="text-gray-400 text-sm mt-1.5">
              Sign in to your account to continue
            </p>
          </div>

          {/* Login type toggle */}
          <div className="flex mb-8 bg-gray-200/70 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setLoginType('internal')}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                loginType === 'internal'
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Internal Staff
            </button>
            <button
              type="button"
              onClick={() => setLoginType('supplier')}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                loginType === 'supplier'
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Factory Supplier
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Login form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Username */}
            <div>
              <label
                htmlFor="username"
                className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={
                  loginType === 'internal'
                    ? 'Enter your username'
                    : 'Enter your supplier username'
                }
                autoComplete="username"
                disabled={isLoading}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={isLoading}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-[18px] h-[18px]" strokeWidth={1.5} />
                  ) : (
                    <Eye className="w-[18px] h-[18px]" strokeWidth={1.5} />
                  )}
                </button>
              </div>
            </div>

            {/* Sign in button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3.5 bg-gray-900 text-white rounded-lg text-sm font-semibold tracking-wide hover:bg-gray-800 active:scale-[0.99] transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </div>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="mt-8 text-center text-xs text-gray-300">
            Need help?{' '}
            <span className="text-gray-400 hover:text-gray-600 font-medium transition-colors cursor-pointer">
              Contact your administrator
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
