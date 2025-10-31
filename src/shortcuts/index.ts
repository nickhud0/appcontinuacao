import { useEffect } from "react";

type ShortcutHandler = (event: KeyboardEvent) => void;

export function useGlobalShortcuts(handlers: Record<string, ShortcutHandler>) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      // Desativar atalhos quando um campo de entrada estiver em foco
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === 'INPUT' ||
         active.tagName === 'TEXTAREA' ||
         active.tagName === 'SELECT' ||
         active.getAttribute('contenteditable') === 'true')
      ) {
        return; // não executar atalhos
      }

      const key = event.key.toLowerCase();
      if (handlers[key]) {
        event.preventDefault();
        handlers[key](event);
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handlers]);
}

