'use client';

import { useEffect } from 'react';

/**
 * 全局弹窗无障碍辅助（见 docs/admin-ui.md § 12）：
 *   - Esc 关闭最顶层 modal-overlay（向其派发 mousedown，让各 modal 原有的关闭逻辑生效）
 *   - 弹窗挂载时自动聚焦首个可聚焦元素（输入框优先，其次按钮）
 *   - Tab 键焦点循环锁在 modal-panel 内
 * 仅 1 个全局实例即可，挂在 admin/layout 根节点。
 */
export function ModalA11y() {
  useEffect(() => {
    const focusableSelector = [
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'button:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    function topOverlay(): HTMLElement | null {
      const list = document.querySelectorAll<HTMLElement>('.modal-overlay');
      if (!list.length) return null;
      for (let i = list.length - 1; i >= 0; i--) {
        const el = list[i];
        if (el.offsetParent !== null || el.getClientRects().length > 0) return el;
      }
      return null;
    }

    function firstFocusableInPanel(panel: HTMLElement): HTMLElement | null {
      const items = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));
      // 优先 input/textarea/select
      const input = items.find((el) => /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      return input ?? items[0] ?? null;
    }

    function panelOf(overlay: HTMLElement): HTMLElement | null {
      return overlay.querySelector<HTMLElement>('.modal-panel');
    }

    // 1) Esc 关闭 + Tab 焦点陷阱
    const onKey = (e: KeyboardEvent) => {
      const overlay = topOverlay();
      if (!overlay) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        const evt = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        Object.defineProperty(evt, 'target', { value: overlay, enumerable: true });
        overlay.dispatchEvent(evt);
        // 同时 click 兜底
        overlay.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return;
      }
      if (e.key === 'Tab') {
        const panel = panelOf(overlay);
        if (!panel) return;
        const items = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter(
          (el) => el.offsetParent !== null,
        );
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
          if (active === first || !panel.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    // 2) MutationObserver：新挂载的 overlay 自动聚焦首个元素
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          const overlay = n.classList?.contains('modal-overlay')
            ? n
            : n.querySelector?.<HTMLElement>('.modal-overlay');
          if (!overlay) return;
          const panel = panelOf(overlay);
          if (!panel) return;
          // 等下一帧，等 React 完成渲染
          requestAnimationFrame(() => {
            const target = firstFocusableInPanel(panel);
            if (target && !panel.contains(document.activeElement)) {
              try {
                target.focus({ preventScroll: true });
              } catch {
                target.focus();
              }
            }
          });
        });
      }
    });

    window.addEventListener('keydown', onKey);
    observer.observe(document.body, { childList: true, subtree: true });

    // 首次加载时若已有 overlay，也处理一次
    const existing = topOverlay();
    if (existing) {
      const panel = panelOf(existing);
      if (panel) {
        const target = firstFocusableInPanel(panel);
        target?.focus();
      }
    }

    return () => {
      window.removeEventListener('keydown', onKey);
      observer.disconnect();
    };
  }, []);

  return null;
}
