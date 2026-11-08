/**
 * Separador de data do fio da conversa (#89, #117): pilula centralizada com raio de ~8 px, grudada no
 * topo enquanto o dia rola. O fundo vem do tema (card: branco no claro, cinza-escuro no escuro) e e
 * opaco para continuar legivel sobre o padrao do fundo da conversa.
 */
export function SeparadorDeData({ rotulo }: { rotulo: string }) {
  return (
    <div className="sticky top-0 z-10 flex justify-center py-1.5">
      <span className="rounded-[8px] bg-card px-3 py-1 text-[12.5px] text-muted-foreground shadow-sm">
        {rotulo}
      </span>
    </div>
  );
}
