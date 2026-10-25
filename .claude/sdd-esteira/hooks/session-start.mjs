#!/usr/bin/env node
// Hook SessionStart: mantém o motor do projeto (.sdd/bin) em dia com o plugin e
// injeta no contexto um resumo curto da esteira. O que vai para stdout vira contexto.
import fs from 'node:fs';
import path from 'node:path';
import { findProjectRoot, installEngine, listChanges, ENGINE_VERSION, PLUGIN_ROOT } from '../scripts/lib.mjs';

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf-8') || '{}'); } catch { /* sem stdin */ }

const cli = path.join(PLUGIN_ROOT, 'scripts', 'sdd.mjs');
const root = findProjectRoot(input.cwd || process.cwd());

if (!root) {
  console.log(`Plugin SDD v${ENGINE_VERSION} disponível. Projeto sem esteira: para adotar, use /sdd:init (CLI do plugin: node "${cli}").`);
  process.exit(0);
}

try {
  installEngine(root);
} catch (e) {
  console.log(`Aviso SDD: não foi possível atualizar .sdd/bin (${e.message}). CLI do plugin: node "${cli}".`);
}

const active = listChanges(root).filter((c) => c.stage !== 'done');
const done = listChanges(root).filter((c) => c.stage === 'done');
const lines = [
  `Esteira SDD v${ENGINE_VERSION} ativa neste projeto (skill sdd-flow). CLI: node .sdd/bin/sdd.mjs`,
  'Código de produção só com mudança em implement/verify. Aprovação de estágio só pelo usuário (/sdd:approve).'
];
if (active.length) {
  lines.push('Mudanças ativas:');
  for (const c of active.slice(0, 8)) lines.push(`- ${c.id} (porte ${c.size}) em ${c.stage}`);
} else {
  lines.push('Nenhuma mudança ativa. Para uma nova: /sdd:new <pedido>.');
}
if (done.length) lines.push(`Concluídas aguardando /sdd:archive: ${done.map((c) => c.id).join(', ')}`);
console.log(lines.join('\n'));
