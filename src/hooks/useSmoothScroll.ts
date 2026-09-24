import { useEffect, useRef } from 'react';
import Lenis from 'lenis';

interface UseSmoothScrollOptions {
  enabled?: boolean;
  lerp?: number;
  duration?: number;
  wheelMultiplier?: number;
  handleKeys?: boolean;
}

/**
 * Hook reutilizável para aplicar rolagem ultra-fluida (momentum physics a 60/120fps)
 * via biblioteca oficial Lenis em qualquer elemento rolável do app.
 */
export function useSmoothScroll<T extends HTMLElement = HTMLDivElement>(
  options: UseSmoothScrollOptions = {}
) {
  const {
    enabled = true,
    lerp = 0.12,
    duration = 0.85,
    wheelMultiplier = 1.0,
    handleKeys = true
  } = options;

  const elementRef = useRef<T>(null);
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    // Em dispositivos móveis/touch (Android, iOS, Galaxy Z Flip, tablets), desativa o Lenis para
    // que a rolagem nativa de hardware a 120Hz funcione com máxima fluidez e sem interceptar gestos
    const isTouchOrMobile =
      typeof window !== 'undefined' &&
      (('ontouchstart' in window) ||
        navigator.maxTouchPoints > 0 ||
        /android|iphone|ipad|ipod/i.test(navigator.userAgent));

    if (!enabled || !elementRef.current || isTouchOrMobile) return;

    const element = elementRef.current;

    const lenis = new Lenis({
      wrapper: element,
      content: element,
      autoRaf: true,
      smoothWheel: true,
      lerp,
      duration,
      wheelMultiplier,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
    });

    lenisRef.current = lenis;

    // Garante que o Lenis recalcula dimensões em mudanças de janela e escala de interface (zoom)
    const handleResize = () => {
      lenis.resize();
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('zreader-zoom-change', handleResize);

    // Observa mudanças de dimensões no container e nos seus filhos
    let resizeObserver: ResizeObserver | null = null;
    try {
      resizeObserver = new ResizeObserver(() => {
        lenis.resize();
      });
      resizeObserver.observe(element);
      Array.from(element.children).forEach(child => resizeObserver?.observe(child));
    } catch {}

    // Observa inserções ou remoções de nós no DOM (ex: carregamento dinâmico assíncrono de itens)
    let mutationObserver: MutationObserver | null = null;
    try {
      mutationObserver = new MutationObserver(() => {
        lenis.resize();
        if (resizeObserver) {
          Array.from(element.children).forEach(child => resizeObserver.observe(child));
        }
      });
      mutationObserver.observe(element, { childList: true, subtree: false });
    } catch {}

    let isHovered = false;
    const handleMouseEnter = () => {
      isHovered = true;
    };
    const handleMouseLeave = () => {
      isHovered = false;
    };

    element.addEventListener('mouseenter', handleMouseEnter);
    element.addEventListener('mouseleave', handleMouseLeave);

    let handleKeyDown: ((e: KeyboardEvent) => void) | null = null;

    if (handleKeys) {
      handleKeyDown = (e: KeyboardEvent) => {
        // Ignora se o leitor estiver aberto por cima ou se houver um modal em primeiro plano
        if (document.querySelector('[data-reader-modal="true"]')) return;

        // Não interceptar se o usuário estiver digitando em campo de texto
        const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (
          targetTag === 'input' ||
          targetTag === 'textarea' ||
          targetTag === 'select' ||
          (e.target as HTMLElement)?.isContentEditable
        ) {
          return;
        }

        // Intercepta somente se o container estiver sob o cursor do mouse ou focado
        if (isHovered || element.contains(document.activeElement)) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            lenis.scrollTo(lenis.scroll + 200, {
              duration: 0.35,
              easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
            });
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            lenis.scrollTo(lenis.scroll - 200, {
              duration: 0.35,
              easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
            });
          } else if (e.key === 'PageDown') {
            e.preventDefault();
            const jump = (element.clientHeight || 500) * 0.85;
            lenis.scrollTo(lenis.scroll + jump, { duration: 0.45 });
          } else if (e.key === 'PageUp') {
            e.preventDefault();
            const jump = (element.clientHeight || 500) * 0.85;
            lenis.scrollTo(lenis.scroll - jump, { duration: 0.45 });
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('zreader-zoom-change', handleResize);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      element.removeEventListener('mouseenter', handleMouseEnter);
      element.removeEventListener('mouseleave', handleMouseLeave);
      if (handleKeyDown) {
        window.removeEventListener('keydown', handleKeyDown);
      }
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [enabled, lerp, duration, wheelMultiplier, handleKeys]);

  return elementRef;
}
