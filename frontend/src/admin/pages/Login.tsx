import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { isDemo, isDesktop } from '@/lib/api'
import { brand } from '@/lib/brand'
import { useLogin, useMe } from '../auth'
import { apiError } from '../lib'
import { inputClass } from '../components/common'
import { LangSwitch } from '../i18n/LangSwitch'

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

  const enter = (as: string) => login.mutate({ username: as, password: 'demo' }, { onSuccess: () => navigate(target, { replace: true }) })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    login.mutate({ username: username.trim(), password }, { onSuccess: () => navigate(target, { replace: true }) })
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <LangSwitch />
        </div>
        <img src={brand('logo-mark')} alt="" width={221} height={256} className="mx-auto mb-4 h-20 w-auto" />
        <h1 className="mb-1 text-center text-2xl font-semibold">Administration</h1>
        <p className="mb-6 text-center text-muted-foreground">Connectez-vous pour gérer la boutique.</p>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm" noValidate>
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

        {/* The demo site has no real accounts: one click signs in. */}
        {isDemo && (
          <div className="mt-4 space-y-3 rounded-2xl border border-dashed border-border p-4 text-center text-sm">
            <p className="text-muted-foreground">Démo : entrez sans mot de passe.</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-10 flex-1" disabled={login.isPending} onClick={() => enter('admin')}>Entrer comme propriétaire</Button>
              <Button type="button" variant="outline" className="h-10 flex-1" disabled={login.isPending} onClick={() => enter('equipe')}>Entrer comme employé</Button>
            </div>
          </div>
        )}

        {/* In the desktop app there is no shop to go back to. */}
        {!isDesktop && (
          <p className="mt-6 text-center text-sm">
            <Link to="/" className="underline underline-offset-4 hover:no-underline">
              Retour à la boutique
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
