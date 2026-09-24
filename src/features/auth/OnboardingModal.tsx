import React, { useState } from 'react';
import {
  Shield,
  Key,
  ArrowSquareOut,
  CheckCircle,
  WarningCircle,
  User,
  Eye,
  EyeSlash,
  Lock
} from '@phosphor-icons/react';
import { UserProfile } from '../../types/mangadex';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfile: UserProfile | null;
  onProfileCreated: (profile: UserProfile) => void;
  onMangaDexConnected: (username: string) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  currentProfile,
  onProfileCreated,
  onMangaDexConnected
}) => {
  const [step, setStep] = useState<1 | 2>(currentProfile ? 2 : 1);
  const [profileName, setProfileName] = useState(currentProfile?.name || 'Leitor');
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showMasterPassword, setShowMasterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // MangaDex Personal Client Form
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Step 1: Create App Profile (Local with Master Password)
  const handleSetupProfile = async () => {
    setErrorMsg(null);
    if (!masterPassword || masterPassword.length < 12) {
      setErrorMsg('A senha mestra deve conter pelo menos 12 caracteres.');
      return;
    }
    if (masterPassword !== confirmPassword) {
      setErrorMsg('As senhas digitadas não coincidem.');
      return;
    }

    setIsLoading(true);
    try {
      const profile = await window.electronAPI.setupLocalProfile(masterPassword, profileName.trim() || 'Leitor');
      onProfileCreated(profile);
      setStep(2);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao criar perfil local.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Connect MangaDex Personal Client
  const handleConnectMangaDex = async () => {
    setErrorMsg(null);
    if (!clientId.trim() || !clientSecret.trim() || !username.trim() || !password.trim()) {
      setErrorMsg('Preencha todos os 4 campos do Personal Client e da sua conta MangaDex.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await window.electronAPI.connectMangaDex(
        clientId.trim(),
        clientSecret.trim(),
        username.trim(),
        password
      );

      if (res.success) {
        onMangaDexConnected(username.trim());
        onClose();
      } else {
        setErrorMsg(res.error || 'Falha ao autenticar na MangaDex. Verifique as credenciais digitadas.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro de conexão com o servidor da MangaDex.');
    } finally {
      setIsLoading(false);
    }
  };

  const openMangaDexSettings = () => {
    window.electronAPI.openExternal('https://mangadex.org/settings');
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/85 backdrop-blur-md animate-in fade-in duration-200 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-lg bg-background-card border border-background-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[85vh] my-auto">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-background-elevated/40 border-b border-background-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              {step === 1 ? <Key className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-100">
                {step === 1 ? '1. Criar Perfil Local (Senha Mestra)' : '2. Conectar Conta MangaDex'}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                {step === 1
                  ? 'Criptografia local com cofre seguro. Seus dados ficam salvos automaticamente.'
                  : 'Sincronize seus títulos, capítulos lidos e listas de leitura'}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 flex-1 min-h-0">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-accent-rose/15 border border-accent-rose/30 flex items-start gap-2.5 text-xs text-rose-200 animate-in fade-in duration-150">
              <WarningCircle className="w-4 h-4 text-accent-rose shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {step === 1 ? (
            /* STEP 1: Local Master Password Setup */
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-primary/10 border border-primary/20 space-y-1.5 text-xs text-slate-200">
                <div className="flex items-center gap-2 font-semibold text-primary">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Segurança Local-First & Sessão Automática</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Defina o nome do seu perfil e sua senha mestra. Ao fechar o app, tudo permanecerá salvo de forma segura para você continuar logado automaticamente quando abrir o ZReader.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nome de Exibição
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Seu nome ou apelido"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-background/80 border border-background-border rounded-lg text-slate-100 focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Senha Mestra Local
                </label>
                <div className="relative">
                  <input
                    type={showMasterPassword ? 'text' : 'password'}
                    placeholder="Mínimo 12 caracteres"
                    value={masterPassword}
                    onChange={(e) => setMasterPassword(e.target.value)}
                    className="w-full pl-3 pr-9 py-2 text-xs bg-background/80 border border-background-border rounded-lg text-slate-100 focus:outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowMasterPassword(!showMasterPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                    title={showMasterPassword ? "Ocultar" : "Mostrar"}
                  >
                    {showMasterPassword ? <EyeSlash className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Confirmar Senha Mestra
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Repita sua senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-3 pr-9 py-2 text-xs bg-background/80 border border-background-border rounded-lg text-slate-100 focus:outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                    title={showConfirmPassword ? "Ocultar" : "Mostrar"}
                  >
                    {showConfirmPassword ? <EyeSlash className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* STEP 2: MangaDex Personal Client */
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-primary/10 border border-primary/20 space-y-2 text-xs text-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-primary">Como obter seu Personal Client?</span>
                  <button
                    onClick={openMangaDexSettings}
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    Abrir mangadex.org/settings <ArrowSquareOut className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  1. Acesse <strong>mangadex.org/settings</strong> e role até a seção <strong>API Client</strong>.
                  <br />
                  2. Crie ou copie o <strong>Personal Client</strong> para obter o <strong>Client ID</strong> e o <strong>Client Secret</strong>.
                  <br />
                  3. Seus dados são salvos com segurança no cofre DPAPI do Windows e mantêm sua sessão sincronizada.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Client ID (ex: personal-client-...)
                  </label>
                  <input
                    type="text"
                    placeholder="personal-client-..."
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-background/80 border border-background-border rounded-lg text-slate-100 focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Client Secret
                  </label>
                  <div className="relative">
                    <input
                      type={showClientSecret ? 'text' : 'password'}
                      placeholder="••••••••••••••••"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      className="w-full pl-3 pr-9 py-2 text-xs bg-background/80 border border-background-border rounded-lg text-slate-100 focus:outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowClientSecret(!showClientSecret)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1"
                      title={showClientSecret ? "Ocultar" : "Mostrar"}
                    >
                      {showClientSecret ? <EyeSlash className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Usuário MangaDex
                  </label>
                  <input
                    type="text"
                    placeholder="Seu usuário MangaDex"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-background/80 border border-background-border rounded-lg text-slate-100 focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Senha MangaDex
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-3 pr-9 py-2 text-xs bg-background/80 border border-background-border rounded-lg text-slate-100 focus:outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1"
                      title={showPassword ? "Ocultar" : "Mostrar"}
                    >
                      {showPassword ? <EyeSlash className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="p-3.5 sm:p-4 bg-background-elevated/90 border-t border-background-border flex items-center justify-between gap-2 shrink-0">
          {step === 2 && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors py-2 px-2"
            >
              Conectar mais tarde
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {step === 1 ? (
              <button
                type="button"
                disabled={isLoading}
                onClick={handleSetupProfile}
                className="px-4 sm:px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-[#0D0A0E] text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50 shadow-sm"
              >
                {isLoading ? 'Criando perfil...' : 'Criar Perfil e Avançar'}
                <CheckCircle className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isLoading}
                onClick={handleConnectMangaDex}
                className="px-4 sm:px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-[#0D0A0E] text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50 shadow-sm"
              >
                {isLoading ? 'Autenticando na MangaDex...' : 'Conectar e Salvar'}
                <CheckCircle className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
