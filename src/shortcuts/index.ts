import { useEffect } from "react";

type ShortcutHandler = (event: KeyboardEvent) => void;

export function useGlobalShortcuts(handlers: Record<string, ShortcutHandler>) {
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();

      // 🔥 Bloqueia atalhos se estiver digitando em campo de texto
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT" ||
          active.getAttribute("contenteditable") === "true")
      ) {
        return;
      }

      // ✅ Atalho universal: tecla "-" para voltar
      if (key === "-") {
        window.history.back();
        return;
      }

      // Handlers locais da tela atual
      if (handlers[key]) {
        event.preventDefault();
        handlers[key](event);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [handlers]);
}

