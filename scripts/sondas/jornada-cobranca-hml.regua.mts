// Helper da jornada-cobranca-hml.mjs (mudança 003, T-040): roda a régua da cobrança, a MESMA
// função que a rodada horária do cron chama (`aplicarRegua`), contra o banco da hml, SÓ para a
// organização de teste indicada. Imprime uma linha JSON: { acao }. Não imprime segredo nem e-mail.
/* eslint-disable no-console */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const org = process.argv[2];
if (!org || !/^[0-9a-f-]{36}$/.test(org)) throw new Error("uso: regua.mts <organization_id>");
const e = Object.fromEntries(
  readFileSync(join(homedir(), ".secrets", "supabase-hml.env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
process.env.NEXT_PUBLIC_SUPABASE_URL = e.SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = e.SUPABASE_ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = e.SUPABASE_SERVICE_ROLE_KEY;
const { aplicarRegua } = await import("@/lib/cobranca/sincronizar");
const { createAdminClient } = await import("@/lib/supabase/admin");
const acao = await aplicarRegua(createAdminClient(), org);
console.log(JSON.stringify({ acao }));
process.exit(0);
