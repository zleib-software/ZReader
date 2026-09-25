import React, { useState, useEffect } from 'react';
import { useSmoothScroll } from '../../hooks/useSmoothScroll';
import {
  Gear,
  Shield,
  ShieldWarning,
  HardDrive,
  User,
  SignOut,
  Trash,
  CheckCircle,
  FolderOpen,
  Info,
  Lock,
  Key,
  Sparkle,
  Monitor,
  ArrowCounterClockwise
} from '@phosphor-icons/react';
import { UserProfile } from '../../types/mangadex';

interface SettingsViewProps {
  profile: UserProfile | null;
  mangadexConnected: boolean;
  mangadexUsername: string | null;
  ratingsAllowed: string[];
  setRatingsAllowed: (ratings: string[]) => void;
  onOpenAuthModal: () => void;
  onDisconnectMangaDex: () => void;
  onResetApp: () => void;
  onLockSession?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  profile,
  mangadexConnected,
  mangadexUsername,
  ratingsAllowed,
  setRatingsAllowed,
  onOpenAuthModal,
  onDisconnectMangaDex,
  onResetApp,
  onLockSession
}) => {
  const [downloadsPath, setDownloadsPath] = useState<string>('');
  const [showAgeWarningModal, setShowAgeWarningModal] = useState(false);
  const [pendingRating, setPendingRating] = useState<'erotica' | 'pornographic' | null>(null);

  const isMobile =
    typeof window !== 'undefined' &&
    (Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
      /android|iphone|ipad|ipod/i.test(navigator.userAgent));
  const [guiScale, setGuiScale] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('zreader_gui_scale');
      return saved ? parseFloat(saved) : 1.0;
    } catch {
      return 1.0;
    }
  });

  const applyGuiScale = (factor: number) => {
    const clamped = Math.min(1.45, Math.max(0.85, Math.round(factor * 100) / 100));
    setGuiScale(clamped);
    try {
      localStorage.setItem('zreader_gui_scale', String(clamped));
      window.electronAPI?.setZoomFactor?.(clamped);
      window.electronAPI?.setSetting?.('gui_scale', String(clamped)).catch(() => {});
      window.dispatchEvent(new CustomEvent('zreader-zoom-change', { detail: clamped }));
    } catch (err) {
      console.error('Erro ao salvar escala:', err);
    }
  };

  const getScaleLabel = (scale: number) => {
    if (scale <= 0.9) return '(Compacto)';
    if (scale <= 1.05) return '(Padrão)';
    if (scale <= 1.2) return '(Médio)';
    if (scale <= 1.35) return '(Grande)';
    return '(Máximo)';
  };

  useEffect(() => {
    window.electronAPI.getDownloadsPath().then(setDownloadsPath);
  }, []);

  const handleToggleRating = (rating: string) => {
    if (rating === 'safe' || rating === 'suggestive') {
      if (ratingsAllowed.includes(rating)) {
        // Must keep at least safe
        if (rating === 'safe' && ratingsAllowed.length === 1) return;
        setRatingsAllowed(ratingsAllowed.filter(r => r !== rating));
      } else {
        setRatingsAllowed([...ratingsAllowed, rating]);
      }
      return;
    }

    if (ratingsAllowed.includes(rating)) {
      setRatingsAllowed(ratingsAllowed.filter(r => r !== rating));
    } else {
      setPendingRating(rating as any);
      setShowAgeWarningModal(true);
    }
  };

  const confirmAdultContent = () => {
    if (pendingRating) {
      setRatingsAllowed([...ratingsAllowed, pendingRating]);
    }
    setShowAgeWarningModal(false);
    setPendingRating(null);
  };

  const handleChangeFolder = async () => {
    const newPath = await window.electronAPI.selectDirectory();
    if (newPath) {
      setDownloadsPath(newPath);
    }
  };

  const scrollRef = useSmoothScroll();

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 w-full overflow-y-auto p-3.5 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div>
            <h1 className="text-sm font-bold text-white flex items-center gap-2">
              <Gear weight="bold" className="w-4 h-4 text-primary" />
              Configurações do Aplicativo
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Preferências locais, segurança e controle de conteúdo
            </p>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-[11px] font-mono font-medium text-slate-300">
              v2.0.10
            </span>
          </div>
        </div>

        {/* 1. Interface Scale (Desktop Only) */}
        {!isMobile && (
          <section className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.07] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Monitor weight="bold" className="w-4 h-4 text-primary" />
                <div>
                  <h2 className="text-xs font-bold text-slate-100">Tamanho da Interface</h2>
                  <p className="text-[11px] text-slate-400">
                    Ajuste a escala visual do aplicativo, aumentando ou diminuindo os textos e ícones em tempo real.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-primary/15 border border-primary/30 text-xs font-mono font-medium text-primary">
                  {Math.round(guiScale * 100)}% {getScaleLabel(guiScale)}
                </span>
                {Math.abs(guiScale - 1.0) > 0.01 && (
                  <button
                    type="button"
                    onClick={() => applyGuiScale(1.0)}
                    className="p-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors border border-white/[0.08]"
                    title="Redefinir para padrão (100%)"
                  >
                    <ArrowCounterClockwise weight="bold" className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Slider & Presets */}
            <div className="space-y-3 bg-white/[0.02] p-3.5 rounded-lg border border-white/[0.06]">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                  <span>85% (Compacto)</span>
                  <span>100% (Padrão)</span>
                  <span>115% (Médio)</span>
                  <span>130% (Grande)</span>
                  <span>145% (Máximo)</span>
                </div>
                <input
                  type="range"
                  min={85}
                  max={145}
                  step={5}
                  value={Math.round(guiScale * 100)}
                  onChange={(e) => applyGuiScale(Number(e.target.value) / 100)}
                  className="w-full accent-primary h-1.5 bg-white/[0.08] rounded cursor-pointer"
                />
              </div>

              {/* Quick Step Buttons */}
              <div className="grid grid-cols-5 gap-2 pt-1">
                {[
                  { val: 0.85, label: '85%', tag: 'Compacto' },
                  { val: 1.00, label: '100%', tag: 'Padrão' },
                  { val: 1.15, label: '115%', tag: 'Médio' },
                  { val: 1.30, label: '130%', tag: 'Grande' },
                  { val: 1.45, label: '145%', tag: 'Máximo' }
                ].map(item => {
                  const isActive = Math.abs(guiScale - item.val) < 0.03;
                  return (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => applyGuiScale(item.val)}
                      className={`py-1.5 px-2 rounded-md text-center transition-colors border ${
                        isActive
                          ? 'bg-primary/15 text-primary font-semibold border-primary/40'
                          : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.07] text-slate-300'
                      }`}
                    >
                      <p className="text-xs font-mono font-medium leading-tight">{item.label}</p>
                      <p className={`text-[10px] leading-tight mt-0.5 ${isActive ? 'text-primary/90' : 'text-slate-400'}`}>
                        {item.tag}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        )}

      {/* 2. Content Rating */}
      <section className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.07] space-y-4">
        <div className="flex items-center gap-2.5">
          <Shield weight="bold" className="w-4 h-4 text-primary" />
          <div>
            <h2 className="text-xs font-bold text-slate-100">Filtro de Conteúdo (Content Rating)</h2>
            <p className="text-[11px] text-slate-400">
              A MangaDex classifica obras em 4 níveis. Conteúdo adulto exige confirmação expressa de maioridade.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          {[
            { id: 'safe', label: 'Livre (Safe)', desc: 'Para todas as idades' },
            { id: 'suggestive', label: 'Sugestivo', desc: 'Leve insinuação' },
            { id: 'erotica', label: 'Erótico (18+)', desc: 'Conteúdo maduro' },
            { id: 'pornographic', label: 'Adulto (+18)', desc: 'Conteúdo explícito' }
          ].map(r => {
            const isChecked = ratingsAllowed.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => handleToggleRating(r.id)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  isChecked
                    ? 'bg-primary/10 border-primary/40 text-slate-100'
                    : 'bg-white/[0.02] border-white/[0.07] text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold">{r.label}</span>
                  {isChecked && <CheckCircle weight="bold" className="w-3.5 h-3.5 text-primary" />}
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">{r.desc}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Perfil Local & Segurança */}
      <section className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.07] space-y-4">
        <div className="flex items-center gap-2.5">
          <Key weight="bold" className="w-4 h-4 text-primary" />
          <div>
            <h2 className="text-xs font-bold text-slate-100">Perfil Local & Cofre Seguro</h2>
            <p className="text-[11px] text-slate-400">
              Criptografia no nível do sistema operacional (Windows DPAPI) e derivação Argon2id
            </p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center text-white font-bold text-xs shrink-0 overflow-hidden">
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User weight="bold" className="w-4 h-4 text-slate-400" />
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-200">
                {profile?.name || 'Perfil Local'}
              </p>
              <p className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                Sessão salva automaticamente
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onLockSession && profile?.hasPassword && (
              <button
                type="button"
                onClick={onLockSession}
                className="px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
                title="Bloquear a tela com o PIN local imediatamente"
              >
                <Lock weight="bold" className="w-3.5 h-3.5 text-primary" />
                <span>Bloquear</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 4. MangaDex Account Management */}
      <section className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.07] space-y-4">
        <div className="flex items-center gap-2.5">
          <User weight="bold" className="w-4 h-4 text-primary" />
          <div>
            <h2 className="text-xs font-bold text-slate-100">Conexão MangaDex (API Client)</h2>
            <p className="text-[11px] text-slate-400">
              Autenticação OAuth 2.0 via Personal Client gravado no cofre seguro do sistema
            </p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`w-2 h-2 rounded-full ${
                mangadexConnected ? 'bg-primary' : 'bg-slate-500'
              }`}
            />
            <div>
              <p className="text-xs font-semibold text-slate-200">
                {mangadexConnected
                  ? `Conectado como: ${mangadexUsername || 'Usuário MangaDex'}`
                  : 'Nenhuma conta MangaDex conectada'}
              </p>
              <p className="text-[10px] text-slate-400">
                {mangadexConnected
                  ? 'Tokens renovados automaticamente antes de expirar'
                  : 'Conecte para sincronizar follows e progresso'}
              </p>
            </div>
          </div>

          {mangadexConnected ? (
            <button
              onClick={onDisconnectMangaDex}
              className="px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-accent-rose/15 border border-white/[0.08] hover:border-accent-rose/40 text-xs text-slate-300 hover:text-accent-rose flex items-center gap-1.5 transition-colors"
            >
              <SignOut weight="bold" className="w-3.5 h-3.5" />
              <span>Desconectar</span>
            </button>
          ) : (
            <button
              onClick={onOpenAuthModal}
              className="px-3 py-1 rounded-md bg-primary hover:bg-primary-hover text-[#0D0A0E] text-xs font-semibold transition-colors"
            >
              Conectar Conta
            </button>
          )}
        </div>
      </section>

      {/* 5. Storage Location */}
      <section className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.07] space-y-4">
        <div className="flex items-center gap-2.5">
          <HardDrive weight="bold" className="w-4 h-4 text-primary" />
          <div>
            <h2 className="text-xs font-bold text-slate-100">Armazenamento Offline</h2>
            <p className="text-[11px] text-slate-400">
              Diretório local para salvar imagens e capítulos baixados
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={downloadsPath}
            className="flex-1 px-3 py-1.5 text-xs bg-white/[0.03] border border-white/[0.08] rounded-md text-slate-300 select-all font-mono"
          />
          <button
            onClick={handleChangeFolder}
            className="px-3 py-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors shrink-0"
          >
            <FolderOpen weight="bold" className="w-3.5 h-3.5 text-primary" />
            <span>Alterar Pasta</span>
          </button>
        </div>
      </section>

      {/* 6. LGPD & Privacy Section */}
      <section className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.07] space-y-4">
        <div className="flex items-center gap-2.5">
          <ShieldWarning weight="bold" className="w-4 h-4 text-accent-rose" />
          <div>
            <h2 className="text-xs font-bold text-slate-100">Privacidade & LGPD</h2>
            <p className="text-[11px] text-slate-400">
              Todos os seus dados residem no seu próprio PC. Exclua tudo quando desejar.
            </p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-accent-rose/5 border border-accent-rose/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="text-xs text-slate-300 leading-snug">
            <p className="font-semibold text-rose-200">Apagar todos os dados locais e redefinir app</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Remove o cofre de chaves, histórico local, cache SQLite e desloga da MangaDex.
            </p>
          </div>

          <button
            onClick={onResetApp}
            className="px-3 py-1.5 rounded-md bg-accent-rose hover:bg-rose-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
          >
            <Trash weight="bold" className="w-3.5 h-3.5" />
            <span>Apagar Tudo e Sair</span>
          </button>
        </div>
      </section>

      {/* 7. Terms & Compliance Note */}
      <div className="p-3.5 rounded-lg bg-white/[0.02] border border-white/[0.06] text-[11px] text-slate-500 flex items-start gap-2.5">
        <Info weight="bold" className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Este aplicativo é 100% gratuito e consome estritamente a API pública da MangaDex. Não veicula anúncios, não cobra assinaturas e não envia dados para servidores proprietários. Os direitos das obras e das traduções pertencem aos seus respectivos autores e grupos voluntários de scanlation.
        </p>
      </div>
      </div>

      {/* 18+ Warning Modal */}
      {showAgeWarningModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 overflow-y-auto bg-black/85 backdrop-blur-md pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="w-full max-w-md bg-background-card border border-accent-amber/40 rounded-xl p-5 sm:p-6 shadow-2xl space-y-4 my-auto">
            <div className="w-10 h-10 rounded-lg bg-accent-amber/20 border border-accent-amber/30 flex items-center justify-center text-accent-amber">
              <ShieldWarning weight="bold" className="w-5 h-5" />
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-100">Confirmação de Maioridade (+18)</h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Você está habilitando a exibição de títulos com conteúdo adulto/maduro ({pendingRating}). Conforme as diretrizes da MangaDex, é necessário confirmar que você possui 18 anos ou mais.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowAgeWarningModal(false); setPendingRating(null); }}
                className="px-4 py-2 rounded-md bg-background-hover text-xs font-medium text-slate-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmAdultContent}
                className="px-4 py-2 rounded-md bg-accent-amber hover:bg-amber-600 text-black text-xs font-bold transition-colors"
              >
                Tenho 18 anos ou mais
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
