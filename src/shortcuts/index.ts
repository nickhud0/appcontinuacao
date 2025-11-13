import { useEffect } from "react";

type ShortcutHandler = (event: KeyboardEvent) => void;

// Listener global para a tecla Home (funciona em todas as telas, mesmo sem usar o hook)
function handleHomeKey(event: KeyboardEvent) {
  // ✅ Atalho universal: tecla "Home" para ir para tela inicial (funciona sempre, mesmo em campos de texto)
  if (event.key === "Home") {
    event.preventDefault();
    event.stopPropagation();
    // Navegar para a tela inicial
    const currentPath = window.location.pathname;
    const currentHash = window.location.hash;
    
    if (currentHash) {
      // HashRouter (Capacitor) - mudar apenas o hash
      window.location.hash = "/";
    } else if (currentPath !== "/") {
      // BrowserRouter - navegar usando o histórico
      window.history.pushState({}, "", "/");
      // Forçar atualização do React Router
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    }
  }
}

// Listener global para a tecla "-" (funciona em todas as telas, mesmo sem usar o hook e em campos de texto)
function handleMinusKey(event: KeyboardEvent) {
  // ✅ Atalho universal: tecla "-" para voltar (funciona sempre, mesmo em campos de texto)
  if (event.key === "-" || event.key === "Minus") {
    event.preventDefault();
    event.stopPropagation();
    // Voltar para a tela anterior
    window.history.back();
  }
}

// Registrar os listeners globais uma vez quando o módulo é carregado
if (typeof window !== "undefined") {
  window.addEventListener("keydown", handleHomeKey, true); // true = usar capture phase para interceptar antes de outros handlers
  window.addEventListener("keydown", handleMinusKey, true); // true = usar capture phase para interceptar antes de outros handlers
}

export function useGlobalShortcuts(handlers: Record<string, ShortcutHandler>) {
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();

      // ✅ Atalho universal: tecla "Home" para ir para tela inicial (funciona sempre, mesmo em campos de texto)
      if (event.key === "Home") {
        event.preventDefault();
        event.stopPropagation();
        // Navegar para a tela inicial
        const currentPath = window.location.pathname;
        const currentHash = window.location.hash;
        
        if (currentHash) {
          // HashRouter (Capacitor) - mudar apenas o hash
          window.location.hash = "/";
        } else if (currentPath !== "/") {
          // BrowserRouter - navegar usando o histórico
          window.history.pushState({}, "", "/");
          // Forçar atualização do React Router
          window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
        }
        return;
      }

      // ✅ Atalho universal: tecla "-" para voltar (funciona sempre, mesmo em campos de texto)
      if (key === "-" || event.key === "Minus") {
        event.preventDefault();
        event.stopPropagation();
        window.history.back();
        return;
      }

      // 🔥 Bloqueia atalhos se estiver digitando em campo de texto (exceto Home e "-" que já foram tratados acima)
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

