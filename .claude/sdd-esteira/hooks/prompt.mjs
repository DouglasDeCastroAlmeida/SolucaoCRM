#!/usr/bin/env node
// Hook UserPromptSubmit: registra se o usuário acabou de digitar /sdd:approve.
// O gate (PreToolUse) consome esse registro para liberar uma única aprovação.
// Qualquer outro prompt apaga o registro. Não escreve nada em stdout.
import fs from 'node:fs';
import { findProjectRoot, recordPrompt } from '../scripts/lib.mjs';

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf-8') || '{}'); } catch { /* sem stdin */ }

const root = findProjectRoot(input.cwd || process.cwd());
if (root) {
  try {
    recordPrompt(root, { prompt: input.prompt, sessionId: input.session_id });
  } catch {
    // Nunca bloquear o prompt do usuário por falha ao gravar o estado.
  }
}
