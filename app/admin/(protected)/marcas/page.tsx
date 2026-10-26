import { PainelDeMarcas } from "@/components/admin/marcas/PainelDeMarcas";

export const metadata = { title: "Marcas — Admin Plataforma" };
export const dynamic = "force-dynamic";

/**
 * Marcas, endereços e planos (REQ-008). O layout de `(protected)` já roda
 * `requirePlatformAdmin()`; as rotas `/api/v1/admin/brands/**` revalidam a cada
 * chamada, então a tela nunca é a única guarda.
 */
export default function AdminMarcasPage() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Marcas</h1>
      <PainelDeMarcas />
    </div>
  );
}
