/**
 * Separador de data do fio da conversa (#89): pilula centralizada, grudada no topo enquanto o dia
 * rola. A pilula e opaca (surface) para continuar legivel sobre o padrao do fundo da conversa.
 */
export function SeparadorDeData({ rotulo }: { rotulo: string }) {
  return (
    <div className="sticky top-0 z-10 flex justify-center py-1.5">
      <span className="rounded-full bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
        {rotulo}
      </span>
    </div>
  );
}
