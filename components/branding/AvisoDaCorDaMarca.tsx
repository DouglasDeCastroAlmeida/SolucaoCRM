"use client";

import { useT } from "@/hooks/i18n/useT";

/**
 * ADR 0008: o verde de mensageiro é fixo no app inteiro. A cor da marca (instalação, parceiro ou
 * empresa) vale só para logo, nome, favicon e e-mails, e esta frase está em toda tela que a edita.
 */
export function AvisoDaCorDaMarca() {
  const t = useT();
  return (
    <p data-testid="aviso-da-cor-da-marca" className="text-xs text-text-muted">
      {t("A cor da marca vale só para o logo, o nome, o ícone da aba e os e-mails. A interface usa sempre o verde padrão do sistema.")}
    </p>
  );
}
