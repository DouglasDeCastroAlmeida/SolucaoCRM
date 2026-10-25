#!/usr/bin/env node
// Hook PreToolUse. Três regras:
// 1. Edit/Write em código de produção só com mudança em implement/verify.
// 2. Estado e motor da esteira (meta.json, .sdd/bin, .gate-state.json) e a seção
//    "gate" do config.json nunca são alterados pelo agente.
// 3. "sdd approve" via Bash só quando o último turno do usuário é /sdd:approve (uma vez por turno).
// Exit 2 bloqueia a ferramenta e devolve a mensagem ao Claude.
import fs from 'node:fs';
import path from 'node:path';
import { findProjectRoot, gateDecision, loadConfig, consumeApproval, protectedPathReason, gateConfigChange } from '../scripts/lib.mjs';

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf-8') || '{}');
  } catch {
    return {};
  }
}

function block(message) {
  process.stderr.write(message + '\n');
  process.exit(2);
}

const APPROVE_CMD = /sdd\.mjs["']?\s+approve\b/;

function main() {
  const input = readStdin();
  const tool = input.tool_name || '';
  const params = input.tool_input || {};
  const root = findProjectRoot(input.cwd || process.cwd());
  if (!root) return;
  const mode = (process.env.SDD_GATE || loadConfig(root).gate.mode || 'strict').toLowerCase();
  if (mode === 'off') return;

  if (tool === 'Bash') {
    const cmd = String(params.command || '');
    if (APPROVE_CMD.test(cmd)) {
      if (/--force\b/.test(cmd)) {
        block('Esteira SDD: --force só pode ser usado pelo usuário, no terminal dele.');
      }
      const approval = consumeApproval(root, input.transcript_path, input.session_id);
      if (!approval.ok) {
        block(approval.reason === 'used'
          ? 'Esteira SDD: este /sdd:approve já foi usado. Cada estágio precisa de uma nova aprovação do usuário.'
          : 'Esteira SDD: aprovação de estágio é decisão humana. Peça ao usuário para digitar /sdd:approve (ou rodar "node .sdd/bin/sdd.mjs approve" no terminal dele).');
      }
    }
    return;
  }

  const filePath = params.file_path || params.notebook_path;
  if (!filePath) return;
  const rel = path.relative(root, path.resolve(input.cwd || root, filePath)).split(path.sep).join('/');
  const protectedReason = protectedPathReason(rel);
  if (protectedReason) block(protectedReason);
  if (rel === '.sdd/config.json' && gateConfigChange(root, tool, params)) {
    block('Esteira SDD: a seção "gate" de .sdd/config.json é decisão do usuário. Peça para ele editar o arquivo (ou usar SDD_GATE) se quiser mudar o modo ou os caminhos liberados.');
  }

  const decision = gateDecision({ root, filePath: path.resolve(input.cwd || root, filePath) });
  if (!decision.allow) block(decision.reason);
  if (decision.warn) {
    process.stdout.write(JSON.stringify({ systemMessage: `⚠ ${decision.reason}` }));
  }
}

main();
