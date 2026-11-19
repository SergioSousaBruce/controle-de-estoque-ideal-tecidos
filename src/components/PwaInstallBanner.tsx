import React, { useEffect, useState, useCallback } from 'react';
import { Download, Smartphone, X, Share, MoreVertical, CheckCircle2 } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PwaInstallBannerProps {
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function checkIsIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export const usePwaInstall = (showToast: (msg: string, type?: 'success' | 'error') => void) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window !== 'undefined') {
      return (window as unknown as { __pwaInstallPrompt?: BeforeInstallPromptEvent | null }).__pwaInstallPrompt || null;
    }
    return null;
  });
  const [isStandalone, setIsStandalone] = useState<boolean>(checkIsStandalone);
  const [showGuideModal, setShowGuideModal] = useState(false);

  useEffect(() => {
    const syncPrompt = () => {
      const saved = (window as unknown as { __pwaInstallPrompt?: BeforeInstallPromptEvent | null }).__pwaInstallPrompt;
      if (saved) setDeferredPrompt(saved);
    };

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      (window as unknown as { __pwaInstallPrompt?: BeforeInstallPromptEvent | null }).__pwaInstallPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const handleAppInstalled = () => {
      (window as unknown as { __pwaInstallPrompt?: BeforeInstallPromptEvent | null }).__pwaInstallPrompt = null;
      setDeferredPrompt(null);
      setIsStandalone(true);
      setShowGuideModal(false);
      showToast('Aplicativo instalado com sucesso na tela inicial!', 'success');
    };

    const mq = window.matchMedia('(display-mode: standalone)');
    const handleDisplayChange = () => setIsStandalone(checkIsStandalone());

    window.addEventListener('pwa-prompt-ready', syncPrompt);
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    mq.addEventListener?.('change', handleDisplayChange);

    syncPrompt();

    return () => {
      window.removeEventListener('pwa-prompt-ready', syncPrompt);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mq.removeEventListener?.('change', handleDisplayChange);
    };
  }, [showToast]);

  const triggerInstall = useCallback(async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          (window as unknown as { __pwaInstallPrompt?: BeforeInstallPromptEvent | null }).__pwaInstallPrompt = null;
          setDeferredPrompt(null);
          showToast('Instalando A Ideal Tecidos...', 'success');
        }
      } catch {
        setShowGuideModal(true);
      }
    } else {
      setShowGuideModal(true);
    }
  }, [deferredPrompt, showToast]);

  return {
    isStandalone,
    isIos: checkIsIos(),
    hasNativePrompt: !!deferredPrompt,
    showGuideModal,
    setShowGuideModal,
    triggerInstall,
  };
};

interface PwaInstallUiProps {
  isStandalone: boolean;
  isIos: boolean;
  hasNativePrompt: boolean;
  showGuideModal: boolean;
  setShowGuideModal: (open: boolean) => void;
  triggerInstall: () => void;
}

export const PwaInstallBanner: React.FC<PwaInstallUiProps> = ({
  isStandalone,
  isIos,
  hasNativePrompt,
  showGuideModal,
  setShowGuideModal,
  triggerInstall,
}) => {
  const [dismissed, setDismissed] = useState(false);

  if (isStandalone) return null;

  return (
    <>
      {!dismissed && (
        <div className="bg-gradient-to-r from-slate-900 via-[#172554] to-slate-900 text-white rounded-2xl p-3.5 sm:p-4 shadow-lg border border-blue-400/25 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0 text-emerald-400">
              <Smartphone size={20} />
            </div>
            <div className="min-w-0">
              <p className="font-display font-black text-xs sm:text-sm uppercase tracking-wide leading-tight truncate">
                Instalar A Ideal Tecidos no Celular
              </p>
              <p className="text-[10px] sm:text-xs text-blue-200/80 font-medium leading-tight mt-0.5">
                {hasNativePrompt
                  ? 'Toque em Instalar para abrir direto da tela inicial, sem navegador.'
                  : 'Adicione à tela inicial para acesso rápido em tela cheia.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={triggerInstall}
              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] sm:text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            >
              <Download size={14} strokeWidth={2.5} />
              <span>Instalar</span>
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Fechar aviso de instalação"
              title="Fechar (aparece novamente ao atualizar a página)"
              className="w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Fallback Manual Guide Modal for iOS Safari or browsers without native auto-prompt */}
      {showGuideModal && (
        <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 text-brand-dark dark:text-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 dark:border-slate-800 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-brand-blue/10 dark:bg-blue-950 text-brand-blue dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Smartphone size={22} />
                </div>
                <div>
                  <h3 className="font-display font-black text-lg uppercase tracking-tight leading-tight">
                    Instalar no Celular
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-semibold">
                    {isIos ? 'Passo a passo para iPhone / iPad' : 'Passo a passo no navegador'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {isIos ? (
              <div className="space-y-3 text-xs font-medium text-gray-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-brand-blue text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                  <p>
                    No Safari, toque no botão <strong>Compartilhar</strong> <Share size={14} className="inline text-blue-600 mx-0.5" /> na barra inferior (ou superior no iPad).
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-brand-blue text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                  <p>
                    Role para baixo e toque em <strong>&ldquo;Adicionar à Tela de Início&rdquo;</strong>, depois confirme em <strong>Adicionar</strong>.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs font-medium text-gray-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-brand-blue text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                  <p>
                    Se abriu pelo WhatsApp, toque nos 3 pontinhos e escolha <strong>&ldquo;Abrir no Chrome&rdquo;</strong>.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-brand-blue text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                  <p>
                    No Chrome, toque no menu <MoreVertical size={14} className="inline text-gray-700 dark:text-slate-300 mx-0.5" /> (canto superior direito) e selecione <strong>&ldquo;Instalar aplicativo&rdquo;</strong> ou <strong>&ldquo;Adicionar à tela inicial&rdquo;</strong>.
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full py-3.5 bg-brand-dark hover:bg-brand-blue text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <CheckCircle2 size={16} />
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
};
