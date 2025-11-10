import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

interface UseItemQuickSelectProps {
  materiais: any[];
  handleMaterialClick: (material: any) => void;
}

export function useItemQuickSelect({ materiais, handleMaterialClick }: UseItemQuickSelectProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Abrir input quando pressionar '*'
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const active = document.activeElement;
      
      // Se o input do quick select estiver visível e focado, não interceptar
      if (isVisible && active === inputRef.current) {
        return;
      }

      // Não interceptar se estiver digitando em um input/textarea (exceto para abrir com '*')
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT" ||
          active.getAttribute("contenteditable") === "true")
      ) {
        // Mas permitir '*' mesmo em inputs para abrir o quick select
        if (event.key === "*" && !isVisible) {
          event.preventDefault();
          setIsVisible(true);
          setInputValue("");
        }
        return;
      }

      // Se o input do quick select estiver visível, não processar outros atalhos
      if (isVisible) {
        return;
      }

      // Abrir input com '*'
      if (event.key === "*") {
        event.preventDefault();
        setIsVisible(true);
        setInputValue("");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisible]);

  // Focar no input quando abrir
  useEffect(() => {
    if (isVisible && inputRef.current) {
      // Pequeno delay para garantir que o DOM foi atualizado
      setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
    }
  }, [isVisible]);

  // Handler para Enter no input
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const numero = parseInt(inputValue.trim(), 10);
      
      if (!isNaN(numero) && materiais[numero]) {
        handleMaterialClick(materiais[numero]);
        setIsVisible(false);
        setInputValue("");
      } else {
        // Se o número não existir, apenas fechar sem erro
        setIsVisible(false);
        setInputValue("");
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsVisible(false);
      setInputValue("");
    }
  };

  // Componente QuickSelectInput
  const QuickSelectInput = () => {
    if (!isVisible) return null;

    return (
      <div className="fixed top-4 right-4 z-[9999] bg-background border border-border rounded-lg shadow-lg p-3 min-w-[200px]">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Índice:</span>
          <Input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Digite o número"
            className="flex-1"
            autoFocus
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Pressione Enter para selecionar ou Esc para cancelar
        </p>
      </div>
    );
  };

  return { QuickSelectInput };
}

