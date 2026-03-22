"use client";

import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [mode, setMode] = useState<"password" | "magic">("password");
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    if (code) {
      const supabase = createClient();
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (!error) {
          router.push("/overview");
        } else {
          setError("Login link expired. Please request a new one.");
        }
      });
    }
  }, [searchParams, router]);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      if (authError.message === "Invalid login credentials") {
        // Try to sign up if login fails
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (signUpError) {
          setError(signUpError.message);
          setLoading(false);
          return;
        }
        // Auto sign in after signup
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (loginError) {
          setError("Account created! Check your email to confirm, then log in.");
          setLoading(false);
          return;
        }
      } else {
        setError(authError.message);
        setLoading(false);
        return;
      }
    }

    router.push("/overview");
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1117] relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#E30613]/10 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-[#E30613]/5 rounded-full blur-[96px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/[0.03] backdrop-blur-xl rounded-2xl shadow-2xl border border-white/[0.08] p-8">
          <div className="flex items-center gap-3 mb-8">
            <img
              src="/logo.png"
              alt="Pinformance"
              className="w-11 h-11 rounded-xl"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
                target.nextElementSibling?.classList.remove("hidden");
              }}
            />
            <div className="w-11 h-11 bg-[#E30613] rounded-xl flex items-center justify-center hidden">
              <span className="text-white font-bold text-lg">P</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Pinformance</h1>
              <p className="text-sm text-white/50">
                Sign in to your dashboard
              </p>
            </div>
          </div>

          {sent ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-lg text-white">Check your email</h2>
                <p className="text-sm text-white/50 mt-1">
                  We sent a magic link to <span className="font-medium text-white">{email}</span>
                </p>
                <p className="text-sm text-white/50 mt-1">
                  Click the link in your email to sign in.
                </p>
              </div>
              <button
                onClick={() => setSent(false)}
                className="text-sm text-[#E30613] hover:underline"
              >
                Try a different email
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={mode === "password" ? handlePasswordLogin : handleMagicLink} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-white/70">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 border border-white/10 rounded-xl bg-white/[0.04] text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#E30613]/50 focus:border-[#E30613]/30 transition-all"
                    placeholder="you@company.com"
                    required
                  />
                </div>

                {mode === "password" && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-white/70">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-2.5 border border-white/10 rounded-xl bg-white/[0.04] text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#E30613]/50 focus:border-[#E30613]/30 transition-all"
                      placeholder="Enter your password"
                      required
                      minLength={6}
                    />
                  </div>
                )}

                {error && (
                  <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#E30613] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#c70510] disabled:opacity-50 transition-all glow-btn"
                >
                  {loading ? "Signing in..." : mode === "password" ? "Sign in" : "Send magic link"}
                </button>
              </form>

              <div className="mt-4 text-center">
                <button
                  onClick={() => {
                    setMode(mode === "password" ? "magic" : "password");
                    setError("");
                  }}
                  className="text-sm text-white/40 hover:text-white/70 transition-colors"
                >
                  {mode === "password" ? "Use magic link instead" : "Use password instead"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0f1117]">
        <div className="text-white/30">Loading...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
