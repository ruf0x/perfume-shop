import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { useLogin, useMe } from '../auth'
import { apiError } from '../lib'
import { inputClass } from '../components/common'

export default function Login() {
  const { data: user } = useMe()
  const login = useLogin()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const next = params.get('next')
  const target = next && next.startsWith('/admin') && !next.startsWith('/admin/login') ? next : '/admin'

  if (user) return <Navigate to={target} replace />

  const submit = (e: FormEvent) => {
    e.preventDefault()
    login.mutate({ username: username.trim(), password }, { onSuccess: () => navigate(target, { replace: true }) })
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-secondary/50 p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-3xl">Administration</h1>
        <p className="mb-6 text-center text-muted-foreground">Connectez-vous pour gérer la boutique.</p>

        <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="username" className="block text-sm font-medium">
              Identifiant
            </label>
            <input id="username" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} aria-invalid={login.isError} aria-describedby={login.isError ? 'login-error' : undefined} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-medium">
              Mot de passe
            </label>
            <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} aria-invalid={login.isError} />
          </div>

          {login.isError && (
            <p id="login-error" role="alert" className="text-sm text-destructive">
              {apiError(login.error, 'Connexion impossible.')}
            </p>
          )}

          <Button type="submit" className="h-11 w-full text-base" disabled={login.isPending || !username || !password}>
            {login.isPending ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm">
          <Link to="/" className="underline underline-offset-4 hover:no-underline">
            Retour à la boutique
          </Link>
        </p>
      </div>
    </div>
  )
}
