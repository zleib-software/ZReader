import React, { useState } from 'react';
import { Lock, WarningCircle, Trash, Eye, EyeSlash } from '@phosphor-icons/react';

interface UnlockModalProps {
  isOpen: boolean;
  onUnlockSuccess: () => void;
  onResetApp: () => void;
}

export const UnlockModal: React.FC<UnlockModalProps> = ({ isOpen, onUnlockSuccess, onResetApp }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  if (!isOpen) return null;

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const result = await window.electronAPI.unlockLocalProfile(password);
      if (result.success) {
        onUnlockSuccess();
      } else if (result.locked) {
        setErrorMsg(`Muitas tentativas incorretas. Tente novamente em ${result.lockoutSeconds}s.`);
        setPassword('');
      } else {
        setErrorMsg('Senha incorreta. Tente novamente.');
      }
    } catch {
      setErrorMsg('Erro ao validar senha mestra.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 overflow-y-auto bg-black/90 backdrop-blur-lg pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm bg-background-card border border-background-border rounded-2xl p-5 sm:p-6 shadow-2xl space-y-5 my-auto">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto">
          <Lock className="w-6 h-6" />
        </div>

        <div className="text-center space-y-1">
          <h2 className="text-base font-bold text-white">Desbloquear Aplicativo</h2>
          <p className="text-xs text-slate-400">
            Digite sua senha mestra local para acessar seu cofre seguro
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-accent-rose/15 border border-accent-rose/30 flex items-center gap-2 text-xs text-rose-200">
            <WarningCircle className="w-4 h-4 text-accent-rose shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleUnlock} className="space-y-3">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              autoFocus
              placeholder="Senha Mestra Local"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-3 pr-9 py-2.5 text-xs bg-background/80 border border-background-border rounded-md text-slate-100 focus:outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 transition-colors"
              title={showPassword ? "Ocultar" : "Mostrar"}
            >
              {showPassword ? <EyeSlash className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full py-2.5 rounded-md bg-primary hover:bg-primary-hover text-[#0D0A0E] text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-sm"
          >
            {isLoading ? 'Desbloqueando...' : 'Desbloquear'}
          </button>
        </form>

        <div className="pt-2 border-t border-background-border text-center">
          {!showConfirmReset ? (
            <button
              type="button"
              onClick={() => setShowConfirmReset(true)}
              className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              Esqueceu a senha mestra?
            </button>
          ) : (
            <div className="space-y-2 p-3 rounded-lg bg-accent-rose/10 border border-accent-rose/20 text-left">
              <p className="text-[10px] text-slate-300 leading-snug">
                Por design de segurança estrita, a chave criptográfica nunca sai do PC e <strong>não há recuperação de senha</strong>. Você pode redefinir o app (apagar o cofre local) e refazer o onboarding. Seus follows e histórico na MangaDex continuam salvos na sua conta.
              </p>
              <button
                type="button"
                onClick={onResetApp}
                className="w-full py-1.5 rounded-md bg-accent-rose hover:bg-rose-600 text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Trash className="w-3 h-3" />
                Redefinir App Agora
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
