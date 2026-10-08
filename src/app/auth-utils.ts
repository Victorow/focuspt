export function getTrainerToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    // Supabase v2 persiste a sessão com a chave: sb-{projectRef}-auth-token
    // Tenta múltiplos padrões para robustez a mudanças de versão
    const keys = Object.keys(localStorage);
    const sessionKey = keys.find(
      k => (k.startsWith('sb-') && k.endsWith('-auth-token')) ||
           k.includes('supabase.auth.token')
    );
    if (!sessionKey) return null;
    const raw = localStorage.getItem(sessionKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Supabase v2: { access_token, refresh_token, ... }
    // Supabase v2 novo formato: { session: { access_token, ... } }
    return parsed?.access_token ?? parsed?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Nome do personal trainer logado (lido da sessão Supabase no localStorage). */
export function getTrainerName(): string {
  if (typeof window === 'undefined') return 'Personal Trainer';
  try {
    const keys = Object.keys(localStorage);
    const sessionKey = keys.find(
      k => (k.startsWith('sb-') && k.endsWith('-auth-token')) ||
           k.includes('supabase.auth.token')
    );
    if (!sessionKey) return 'Personal Trainer';
    const raw = localStorage.getItem(sessionKey);
    if (!raw) return 'Personal Trainer';
    const parsed = JSON.parse(raw);
    const user = parsed?.user ?? parsed?.session?.user;
    return user?.user_metadata?.name ?? user?.email?.split('@')[0] ?? 'Personal Trainer';
  } catch {
    return 'Personal Trainer';
  }
}
