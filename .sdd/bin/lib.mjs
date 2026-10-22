// Motor da esteira SDD: estado das mudanças, validação de artefatos, gates,
// estimativa, rastreabilidade e arquivamento. Sem dependências externas.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ENGINE_VERSION = '2.0.0';
// Raiz de onde o motor está rodando: o plugin (scripts/..) ou a cópia no projeto (.sdd/bin/..).
export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TEMPLATES_DIR = path.join(PLUGIN_ROOT, 'templates');
const ENGINE_FILES = ['lib.mjs', 'sdd.mjs'];

// Fluxo de estágios por porte da mudança. S = ajuste pequeno, M = feature, L = feature com arquitetura.
export const FLOWS = {
  S: ['grill', 'tasks', 'implement', 'verify', 'done'],
  M: ['grill', 'prd', 'tasks', 'implement', 'verify', 'done'],
  L: ['grill', 'prd', 'design', 'tasks', 'implement', 'verify', 'done']
};

export const ARTIFACTS = {
  grill: '00-grill.md',
  prd: '01-prd.md',
  design: '02-design.md',
  tasks: '03-tasks.md',
  verify: '04-verify.md'
};

export const TASK_TYPES = [
  'SETUP', 'TEST-CONTRACT', 'TEST-UNIT', 'TEST-INT', 'TEST-UI', 'TEST-E2E',
  'CHECK-SMOKE', 'IMPL', 'REFACTOR', 'DOCS'
];

export const DEFAULT_CONFIG = {
  version: 2,
  language: 'pt-BR',
  gate: {
    mode: 'strict',
    allow: ['.sdd/**', '**/*.md', 'docs/**', '.claude/**', '.github/**']
  },
  // {files} em testFocused é trocado pelos arquivos informados em "sdd run testFocused <arquivos>".
  commands: { test: '', testFocused: '', lint: '', typecheck: '', e2e: '', coverage: '', security: '' },
  profiles: [],
  review: { mode: 'auto' },
  quality: { coverageMin: null },
  run: { timeoutSeconds: 900, tailLines: 25, maxFailureLines: 60 },
  tests: {
    include: ['**/*.test.*', '**/*.spec.*', '**/test_*.py', '**/*_test.go', '**/*Test.java', '**/*Tests.cs', 'tests/**', 'test/**', 'e2e/**'],
    exclude: ['node_modules/**', 'dist/**', 'build/**', '.git/**', '.sdd/**', 'vendor/**', 'coverage/**', '.next/**']
  },
  estimates: {
    SETUP: 10, 'TEST-CONTRACT': 10, 'TEST-UNIT': 20, 'TEST-INT': 35, 'TEST-UI': 30,
    'TEST-E2E': 50, 'CHECK-SMOKE': 15, IMPL: 20, REFACTOR: 15, DOCS: 10
  }
};

export class SddError extends Error {}

// ---------------------------------------------------------------------------
// Projeto e configuração
// ---------------------------------------------------------------------------

export function findProjectRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.sdd', 'config.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function requireProjectRoot(start) {
  const root = findProjectRoot(start);
  if (!root) throw new SddError('Esteira não inicializada neste projeto. Rode /sdd:init (ou "sdd init").');
  return root;
}

export function loadConfig(root) {
  const file = path.join(root, '.sdd', 'config.json');
  const user = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : {};
  return {
    ...DEFAULT_CONFIG,
    ...user,
    gate: { ...DEFAULT_CONFIG.gate, ...(user.gate || {}) },
    commands: { ...DEFAULT_CONFIG.commands, ...(user.commands || {}) },
    review: { ...DEFAULT_CONFIG.review, ...(user.review || {}) },
    quality: { ...DEFAULT_CONFIG.quality, ...(user.quality || {}) },
    run: { ...DEFAULT_CONFIG.run, ...(user.run || {}) },
    tests: { ...DEFAULT_CONFIG.tests, ...(user.tests || {}) },
    estimates: { ...DEFAULT_CONFIG.estimates, ...(user.estimates || {}) }
  };
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function renderTemplate(name, vars = {}) {
  const raw = fs.readFileSync(path.join(TEMPLATES_DIR, name), 'utf-8');
  return raw.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
}

// Copia o motor e os templates para .sdd/ do projeto. Assim o CLI roda sem o plugin
// (terminal, CI) e cada projeto pode customizar seus templates em .sdd/templates/.
// O motor é sempre atualizado; templates existentes nunca são sobrescritos.
export function installEngine(root, sourceRoot = PLUGIN_ROOT) {
  const changed = [];
  const binDir = path.join(root, '.sdd', 'bin');
  const tplDir = path.join(root, '.sdd', 'templates');
  if (path.resolve(sourceRoot) === path.resolve(root, '.sdd')) return changed;
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(tplDir, { recursive: true });
  for (const f of ENGINE_FILES) {
    const src = fs.readFileSync(path.join(sourceRoot, 'scripts', f), 'utf-8');
    const dest = path.join(binDir, f);
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf-8') !== src) {
      fs.writeFileSync(dest, src);
      changed.push(`.sdd/bin/${f}`);
    }
  }
  const copyMissing = (srcDir, destDir, rel) => {
    fs.mkdirSync(destDir, { recursive: true });
    for (const e of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const src = path.join(srcDir, e.name);
      const dest = path.join(destDir, e.name);
      if (e.isDirectory()) copyMissing(src, dest, `${rel}${e.name}/`);
      else if (!fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
        changed.push(`.sdd/templates/${rel}${e.name}`);
      }
    }
  };
  copyMissing(path.join(sourceRoot, 'templates'), tplDir, '');
  return changed;
}

export function initProject(root, { force = false } = {}) {
  const sdd = path.join(root, '.sdd');
  const created = [];
  fs.mkdirSync(sdd, { recursive: true });
  const gitignore = path.join(sdd, '.gitignore');
  if (!fs.existsSync(gitignore)) fs.writeFileSync(gitignore, '.gate-state.json\nruns/\n');
  for (const dir of ['specs', 'changes', 'archive']) {
    const p = path.join(sdd, dir);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
      fs.writeFileSync(path.join(p, '.gitkeep'), '');
      created.push(`.sdd/${dir}/`);
    }
  }
  const configFile = path.join(sdd, 'config.json');
  if (force || !fs.existsSync(configFile)) {
    fs.writeFileSync(configFile, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
    created.push('.sdd/config.json');
  }
  const constitution = path.join(sdd, 'constitution.md');
  if (force || !fs.existsSync(constitution)) {
    fs.writeFileSync(constitution, renderTemplate('constitution.md', {
      PROJECT_NAME: path.basename(root),
      DATE: today()
    }));
    created.push('.sdd/constitution.md');
  }
  created.push(...installEngine(root));
  return created;
}

// ---------------------------------------------------------------------------
// Mudanças (changes)
// ---------------------------------------------------------------------------

export function slugify(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export function changesDir(root) {
  return path.join(root, '.sdd', 'changes');
}

export function listChanges(root) {
  const dir = changesDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'meta.json')))
    .map((e) => readChange(root, e.name))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function resolveChange(root, ref) {
  const changes = listChanges(root);
  if (!ref) {
    const active = changes.filter((c) => c.stage !== 'done');
    if (active.length === 1) return active[0];
    if (active.length === 0) throw new SddError('Nenhuma mudança ativa. Crie uma com /sdd:new.');
    throw new SddError(`Há ${active.length} mudanças ativas; informe qual: ${active.map((c) => c.id).join(', ')}`);
  }
  const match = changes.filter((c) => c.id === ref || c.id.startsWith(`${ref}-`) || c.id.endsWith(`-${ref}`) || c.id.slice(4) === ref);
  if (match.length === 1) return match[0];
  if (match.length === 0) throw new SddError(`Mudança "${ref}" não encontrada em .sdd/changes/.`);
  throw new SddError(`Referência "${ref}" é ambígua: ${match.map((c) => c.id).join(', ')}`);
}

export function readChange(root, id) {
  const dir = path.join(changesDir(root), id);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf-8'));
  return { ...meta, id, dir };
}

export function writeMeta(change) {
  const { dir, ...meta } = change;
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
}

export function nextChangeNumber(root) {
  const used = [
    ...fs.existsSync(changesDir(root)) ? fs.readdirSync(changesDir(root)) : [],
    ...fs.existsSync(path.join(root, '.sdd', 'archive')) ? fs.readdirSync(path.join(root, '.sdd', 'archive')).map((n) => n.slice(11)) : []
  ].map((n) => parseInt(n.slice(0, 3), 10)).filter((n) => Number.isFinite(n));
  return String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0');
}

export function createChange(root, { title, size = 'M', slug } = {}) {
  if (!title) throw new SddError('Informe o título da mudança.');
  size = String(size).toUpperCase();
  if (!FLOWS[size]) throw new SddError('Porte inválido. Use S, M ou L.');
  const id = `${nextChangeNumber(root)}-${slug ? slugify(slug) : slugify(title)}`;
  const dir = path.join(changesDir(root), id);
  fs.mkdirSync(dir, { recursive: true });
  const change = {
    id, dir, title, size,
    stage: 'grill',
    createdAt: new Date().toISOString(),
    approvals: {},
    history: [{ stage: 'grill', at: new Date().toISOString() }]
  };
  writeMeta(change);
  ensureArtifact(change, 'grill');
  return change;
}

export function ensureArtifact(change, stage) {
  const file = ARTIFACTS[stage];
  if (!file) return null;
  const target = path.join(change.dir, file);
  if (!fs.existsSync(target)) {
    const tpl = stage === 'grill' && change.size === 'S' ? 'grill-small.md' : `${file.slice(3)}`;
    fs.writeFileSync(target, renderTemplate(tpl, {
      TITLE: change.title,
      CHANGE_ID: change.id,
      SIZE: change.size,
      DATE: today()
    }));
  }
  return target;
}

function readArtifact(change, stage) {
  const file = path.join(change.dir, ARTIFACTS[stage]);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
}

// ---------------------------------------------------------------------------
// Parsing de markdown
// ---------------------------------------------------------------------------

const PLACEHOLDER_PATTERNS = [
  { re: /\{\{[A-Z_]+\}\}/, label: 'variável de template {{...}}' },
  { re: /<!--\s*PREENCHA/i, label: 'marcador <!-- PREENCHA -->' },
  { re: /\bTODO\b/, label: 'TODO' },
  { re: /\bTBD\b/, label: 'TBD' },
  { re: /\[PREENCHER\]/i, label: '[PREENCHER]' }
];

// Remove comentários HTML preservando a contagem de linhas (exemplos dos templates não contam).
export function stripComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ''));
}

export function findPlaceholders(text) {
  const found = [];
  text.split('\n').forEach((line, i) => {
    for (const p of PLACEHOLDER_PATTERNS) {
      if (p.re.test(line)) found.push({ line: i + 1, label: p.label });
    }
  });
  return found;
}

// Divide o markdown em seções de nível 2 (## Título) -> corpo.
export function sections(text) {
  const result = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m && !line.startsWith('###')) {
      current = m[1];
      result.set(current, '');
    } else if (current) {
      result.set(current, result.get(current) + line + '\n');
    }
  }
  return result;
}

function findSection(secs, name) {
  const key = [...secs.keys()].find((k) => k.toLowerCase().includes(name.toLowerCase()));
  return key === undefined ? null : secs.get(key);
}

function hasContent(body) {
  if (body === null) return false;
  const stripped = body.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*>.*$/gm, '').trim();
  return stripped.length > 0;
}

// Critérios de aceite: linhas "- **AC-001.1** ..." (com continuação até a próxima linha de lista/título).
export function parseAcceptanceCriteria(text) {
  const acs = [];
  const lines = stripComments(text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*[-*]\s*\*\*(AC-\d{3}\.\d+)\*\*\s*[:\-–]?\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    let body = m[2];
    for (let j = i + 1; j < lines.length && !/^\s*[-*]\s*\*\*AC-|^#/.test(lines[j]) && lines[j].trim() !== ''; j++) {
      body += ' ' + lines[j].trim();
    }
    acs.push({ id: m[1], text: body.trim(), line: i + 1 });
  }
  return acs;
}

export function parseRequirements(text) {
  const reqs = [];
  const re = /^###\s+(REQ-\d{3})\s*[:\-–]\s*(.+)$/gm;
  const clean = stripComments(text);
  let m;
  while ((m = re.exec(clean))) reqs.push({ id: m[1], title: m[2].trim() });
  return reqs;
}

const TASK_LINE = /^\s*[-*]\s*\[( |x|X)\]\s*`?(T-\d{3})`?\s*(.*)$/;

export function parseTasks(text) {
  const tasks = [];
  stripComments(text).split('\n').forEach((line, i) => {
    const m = TASK_LINE.exec(line);
    if (!m) return;
    const rest = m[3];
    const tags = [...rest.matchAll(/\[([A-Z][A-Z0-9-]*)\]/g)].map((t) => t[1]);
    const type = tags.find((t) => TASK_TYPES.includes(t)) || null;
    const est = /\(~\s*(\d+(?:[.,]\d+)?)\s*(min|m|h)\s*\)/i.exec(rest);
    let minutes = null;
    if (est) {
      const n = parseFloat(est[1].replace(',', '.'));
      minutes = /^h$/i.test(est[2]) ? Math.round(n * 60) : Math.round(n);
    }
    const depsMatch = /deps?\s*:\s*(T-\d{3}(?:\s*,\s*T-\d{3})*)/i.exec(rest);
    const title = rest
      .replace(/\[[A-Z][A-Z0-9-]*\]/g, '')
      .replace(/\(~[^)]*\)/g, '')
      .replace(/\{\s*AC-[^}]*\}/g, '')
      .replace(/deps?\s*:\s*T-\d{3}(?:\s*,\s*T-\d{3})*/gi, '')
      .replace(/\s+/g, ' ').trim();
    tasks.push({
      id: m[2],
      done: m[1].toLowerCase() === 'x',
      type,
      parallel: tags.includes('P'),
      minutes,
      refs: [...new Set([...rest.matchAll(/AC-\d{3}\.\d+/g)].map((r) => r[0]))],
      deps: depsMatch ? depsMatch[1].split(/\s*,\s*/) : [],
      title,
      line: i + 1
    });
  });
  return tasks;
}

// ---------------------------------------------------------------------------
// Validação por estágio
// ---------------------------------------------------------------------------

function issue(level, stage, message) {
  return { level, stage, message };
}

export function collectAcceptanceCriteria(change) {
  const acs = [];
  for (const stage of ['grill', 'prd']) {
    const text = readArtifact(change, stage);
    if (text) acs.push(...parseAcceptanceCriteria(text).map((a) => ({ ...a, source: ARTIFACTS[stage] })));
  }
  const seen = new Map();
  for (const a of acs) if (!seen.has(a.id)) seen.set(a.id, a);
  return [...seen.values()];
}

const GHERKIN_OR_EARS = /\b(então|entao|then|deve|shall|must)\b/i;

function checkPlaceholders(text, stage, issues) {
  const ph = findPlaceholders(text);
  if (ph.length) {
    const sample = ph.slice(0, 5).map((p) => `linha ${p.line}: ${p.label}`).join('; ');
    issues.push(issue('error', stage, `${ph.length} pendência(s) de preenchimento (${sample}).`));
  }
}

function checkRequiredSections(text, stage, names, issues) {
  const secs = sections(text);
  for (const name of names) {
    const body = findSection(secs, name);
    if (body === null) issues.push(issue('error', stage, `Seção obrigatória ausente: "## ${name}".`));
    else if (!hasContent(body)) issues.push(issue('error', stage, `Seção "## ${name}" está vazia (use "N/A — motivo" se não se aplica).`));
  }
}

function checkAcs(acs, stage, issues) {
  for (const ac of acs) {
    if (!GHERKIN_OR_EARS.test(ac.text)) {
      issues.push(issue('error', stage, `${ac.id} não é verificável: use Dado/Quando/Então ou "QUANDO ... o sistema DEVE ...".`));
    }
  }
}

// Perguntas do Grill: blocos "### P1. ..." dentro de "## Perguntas e respostas".
// Cada uma precisa de resposta do usuário ("- Resposta: ...") ou de fonte no código
// ("- Fonte: ..."). Resposta vazia, PENDENTE ou "a confirmar" bloqueia o gate.
const PENDING_ANSWER = /^(pendente|a confirmar|aguardando.*|tbd|-|…|\.\.\.)?$/i;

export function parseGrillQuestions(text) {
  const body = findSection(sections(stripComments(text)), 'Perguntas e respostas') || '';
  const blocks = body.split(/^###\s+/m).slice(1);
  return blocks.map((b) => {
    const title = b.split('\n')[0].trim();
    const id = (/^(P\d+)/i.exec(title) || [])[1] || title.slice(0, 20);
    const answer = (/^\s*[-*]\s*\**Resposta\**\s*(?:\([^)]*\))?\s*:\s*(.*)$/mi.exec(b) || [])[1];
    const source = (/^\s*[-*]\s*\**Fonte\**\s*:\s*(.*)$/mi.exec(b) || [])[1];
    return { id, title, answer: answer?.trim() ?? null, source: source?.trim() ?? null };
  });
}

function grillQuestionIssues(text) {
  const questions = parseGrillQuestions(text);
  if (!questions.length) {
    return [issue('error', 'grill', 'Nenhuma pergunta registrada em "## Perguntas e respostas" (blocos "### P1. ..." com "- Resposta:" ou "- Fonte:").')];
  }
  const open = questions.filter((q) => {
    const answered = q.answer !== null && !PENDING_ANSWER.test(q.answer.replace(/[*_`]/g, '').trim());
    const sourced = q.source !== null && q.source.length > 3;
    return !answered && !sourced;
  });
  return open.length
    ? [issue('error', 'grill', `${open.length} pergunta(s) sem resposta do usuário: ${open.map((q) => q.id).join(', ')}. Pergunte uma por vez e registre a resposta antes de aprovar.`)]
    : [];
}

const VALIDATORS = {
  grill(change) {
    const issues = [];
    const text = readArtifact(change, 'grill');
    if (text === null) return [issue('error', 'grill', `${ARTIFACTS.grill} ausente.`)];
    checkPlaceholders(text, 'grill', issues);
    checkRequiredSections(text, 'grill', ['Perguntas e respostas', 'Decisões', 'Fora de escopo'], issues);
    issues.push(...grillQuestionIssues(text));
    if (!/^\s*[-*]\s*\*\*D-\d+\*\*/m.test(stripComments(text))) {
      issues.push(issue('error', 'grill', 'Registre ao menos uma decisão no formato "- **D-01** ...".'));
    }
    if (change.size === 'S') {
      const acs = parseAcceptanceCriteria(text);
      if (!acs.length) issues.push(issue('error', 'grill', 'Mudança S precisa de critérios de aceite no Grill ("- **AC-001.1** ...").'));
      checkAcs(acs, 'grill', issues);
    }
    return issues;
  },

  prd(change) {
    const issues = [];
    const text = readArtifact(change, 'prd');
    if (text === null) return [issue('error', 'prd', `${ARTIFACTS.prd} ausente.`)];
    checkPlaceholders(text, 'prd', issues);
    checkRequiredSections(text, 'prd', ['Problema', 'Objetivos', 'Requisitos funcionais', 'Requisitos não funcionais', 'Fora de escopo'], issues);
    const reqs = parseRequirements(text);
    if (!reqs.length) issues.push(issue('error', 'prd', 'Nenhum requisito no formato "### REQ-001: título".'));
    const acs = parseAcceptanceCriteria(text);
    for (const r of reqs) {
      const prefix = `AC-${r.id.slice(4)}.`;
      if (!acs.some((a) => a.id.startsWith(prefix))) {
        issues.push(issue('error', 'prd', `${r.id} não tem critério de aceite (${prefix}1).`));
      }
    }
    checkAcs(acs, 'prd', issues);
    return issues;
  },

  design(change) {
    const issues = [];
    const text = readArtifact(change, 'design');
    if (text === null) return [issue('error', 'design', `${ARTIFACTS.design} ausente.`)];
    checkPlaceholders(text, 'design', issues);
    checkRequiredSections(text, 'design', [
      'Abordagem', 'Componentes afetados', 'Contratos', 'Modelo de dados',
      'Decisões', 'Riscos', 'Estratégia de testes'
    ], issues);
    if (!/^###\s+ADR-\d+/m.test(stripComments(text))) issues.push(issue('error', 'design', 'Registre ao menos um ADR ("### ADR-001: ...").'));
    return issues;
  },

  tasks(change) {
    const issues = [];
    const text = readArtifact(change, 'tasks');
    if (text === null) return [issue('error', 'tasks', `${ARTIFACTS.tasks} ausente.`)];
    checkPlaceholders(text, 'tasks', issues);
    const tasks = parseTasks(text);
    if (!tasks.length) return [...issues, issue('error', 'tasks', 'Nenhuma tarefa no formato "- [ ] T-001 [TIPO] descrição (~20 min) {AC-001.1}".')];
    const ids = new Set();
    for (const t of tasks) {
      if (ids.has(t.id)) issues.push(issue('error', 'tasks', `${t.id} duplicada.`));
      ids.add(t.id);
      if (!t.type) issues.push(issue('error', 'tasks', `${t.id} sem tipo (${TASK_TYPES.join(', ')}).`));
      if (t.minutes === null) issues.push(issue('error', 'tasks', `${t.id} sem estimativa "(~XX min)".`));
      if ((t.type === 'IMPL' || t.type?.startsWith('TEST-')) && !t.refs.length) {
        issues.push(issue('warning', 'tasks', `${t.id} não referencia nenhum critério de aceite.`));
      }
    }
    for (const t of tasks) {
      for (const d of t.deps) if (!ids.has(d)) issues.push(issue('error', 'tasks', `${t.id} depende de ${d}, que não existe.`));
    }
    if (!tasks.some((t) => t.type?.startsWith('TEST-'))) {
      issues.push(issue('error', 'tasks', 'Nenhuma tarefa de teste (TEST-*). A esteira é test-led.'));
    }
    const acs = collectAcceptanceCriteria(change);
    const known = new Set(acs.map((a) => a.id));
    for (const ac of acs) {
      const testTask = tasks.find((t) => t.type?.startsWith('TEST-') && t.refs.includes(ac.id));
      if (!testTask) {
        issues.push(issue('error', 'tasks', `${ac.id} não é coberto por nenhuma tarefa TEST-*.`));
        continue;
      }
      const impl = tasks.find((t) => t.type === 'IMPL' && t.refs.includes(ac.id));
      if (impl && impl.line < testTask.line) {
        issues.push(issue('warning', 'tasks', `${ac.id}: ${impl.id} (IMPL) aparece antes do teste ${testTask.id}. Teste primeiro.`));
      }
    }
    for (const t of tasks) {
      for (const r of t.refs) if (!known.has(r)) issues.push(issue('error', 'tasks', `${t.id} referencia ${r}, que não existe no Grill/PRD.`));
    }
    return issues;
  },

  implement(change) {
    const text = readArtifact(change, 'tasks') || '';
    const pending = parseTasks(text).filter((t) => !t.done);
    return pending.length
      ? [issue('error', 'implement', `${pending.length} tarefa(s) pendente(s): ${pending.map((t) => t.id).join(', ')}.`)]
      : [];
  },

  verify(change, root) {
    const issues = [];
    const text = readArtifact(change, 'verify');
    if (text === null) return [issue('error', 'verify', `${ARTIFACTS.verify} ausente.`)];
    checkPlaceholders(text, 'verify', issues);
    checkRequiredSections(text, 'verify', ['Evidências', 'Rastreabilidade', 'Desvios de escopo', 'Parecer'], issues);
    const parecer = findSection(sections(text), 'Parecer') || '';
    if (!/\bAPROVADO\b/.test(parecer) || /\bREPROVADO\b/.test(parecer)) {
      issues.push(issue('error', 'verify', 'O parecer final precisa declarar "APROVADO".'));
    }
    const matrix = traceability(root, change);
    for (const row of matrix.rows) {
      if (!row.tests.length) issues.push(issue('error', 'verify', `${row.ac} não aparece em nenhum arquivo de teste (inclua o ID no nome do teste).`));
    }
    if (change.size !== 'S' && !listDeltaSpecs(change).length) {
      issues.push(issue('warning', 'verify', 'Nenhuma spec viva atualizada (specs/<capacidade>.md). O comportamento entregue não ficará registrado em .sdd/specs/.'));
    }
    return issues;
  }
};

export function validateStage(root, change, stage = change.stage) {
  const v = VALIDATORS[stage];
  return v ? v(change, root) : [];
}

// ---------------------------------------------------------------------------
// Avanço de estágio (gate com aprovação humana)
// ---------------------------------------------------------------------------

export function nextStage(change) {
  const flow = FLOWS[change.size];
  const i = flow.indexOf(change.stage);
  return i >= 0 && i < flow.length - 1 ? flow[i + 1] : null;
}

export function approve(root, change, { by, force = false, note } = {}) {
  if (change.stage === 'done') throw new SddError(`${change.id} já está concluída. Arquive com /sdd:archive.`);
  const issues = validateStage(root, change);
  const errors = issues.filter((i) => i.level === 'error');
  if (errors.length && !force) {
    const err = new SddError(`Gate de "${change.stage}" bloqueado: ${errors.length} erro(s).`);
    err.issues = issues;
    throw err;
  }
  const from = change.stage;
  const to = nextStage(change);
  const at = new Date().toISOString();
  change.approvals[from] = { at, by: by || defaultApprover(), forced: Boolean(force && errors.length), ...(note ? { note } : {}) };
  change.stage = to;
  change.history.push({ stage: to, at, from, ...(force && errors.length ? { forced: errors.map((e) => e.message) } : {}) });
  writeMeta(change);
  const artifact = ensureArtifact(change, to);
  return { from, to, artifact, issues };
}

function defaultApprover() {
  try {
    return execFileSync('git', ['config', 'user.name'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || os.userInfo().username;
  } catch {
    return os.userInfo().username;
  }
}

// ---------------------------------------------------------------------------
// Estimativa (com totalizador geral obrigatório)
// ---------------------------------------------------------------------------

export function formatDuration(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m}min`;
  return m ? `${h}h ${String(m).padStart(2, '0')}min` : `${h}h`;
}

export function estimate(root, change, config = loadConfig(root)) {
  const tasks = parseTasks(readArtifact(change, 'tasks') || '');
  const rows = tasks.map((t) => {
    const minutes = t.minutes ?? config.estimates[t.type] ?? config.estimates.IMPL;
    return { ...t, minutes, estimated: t.minutes === null };
  });
  const total = rows.reduce((s, r) => s + r.minutes, 0);
  const done = rows.filter((r) => r.done).reduce((s, r) => s + r.minutes, 0);
  return {
    rows,
    totals: {
      tasks: rows.length,
      doneTasks: rows.filter((r) => r.done).length,
      minutes: total,
      doneMinutes: done,
      pendingMinutes: total - done,
      percent: total ? Math.round((done / total) * 100) : 0
    }
  };
}

export function estimateMarkdown(est) {
  const lines = [
    '| Tarefa | Tipo | Descrição | Status | Estimativa |',
    '| :-- | :-- | :-- | :-: | --: |'
  ];
  for (const r of est.rows) {
    lines.push(`| ${r.id}${r.parallel ? ' [P]' : ''} | ${r.type || '?'} | ${r.title.replace(/\|/g, '/')} | ${r.done ? '✅' : '⬜'} | ${formatDuration(r.minutes)}${r.estimated ? '*' : ''} |`);
  }
  const t = est.totals;
  lines.push(`| **TOTALIZADOR GERAL** | | **${t.tasks} tarefas (${t.doneTasks} concluídas, ${t.percent}%)** | | **${formatDuration(t.minutes)}** (restante: ${formatDuration(t.pendingMinutes)}) |`);
  if (est.rows.some((r) => r.estimated)) lines.push('', '\\* sem estimativa explícita; usado o piso do tipo em `.sdd/config.json`.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Rastreabilidade AC -> tarefas -> testes
// ---------------------------------------------------------------------------

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function matchesAny(relPath, globs) {
  const p = relPath.split(path.sep).join('/');
  return globs.some((g) => globToRegExp(g).test(p));
}

export function listTestFiles(root, config = loadConfig(root)) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs).split(path.sep).join('/');
      if (e.isDirectory()) {
        if (matchesAny(rel + '/', config.tests.exclude) || matchesAny(rel, config.tests.exclude) || e.name === 'node_modules' || e.name === '.git') continue;
        walk(abs);
      } else if (matchesAny(rel, config.tests.include) && !matchesAny(rel, config.tests.exclude)) {
        out.push(rel);
      }
    }
  };
  walk(root);
  return out;
}

export function traceability(root, change, config = loadConfig(root)) {
  const acs = collectAcceptanceCriteria(change);
  const tasks = parseTasks(readArtifact(change, 'tasks') || '');
  const files = listTestFiles(root, config).map((f) => ({ f, text: safeRead(path.join(root, f)) }));
  const rows = acs.map((ac) => {
    const re = new RegExp(`${ac.id.replace('.', '\\.')}(?!\\d)`);
    return {
      ac: ac.id,
      text: ac.text,
      tasks: tasks.filter((t) => t.refs.includes(ac.id)).map((t) => t.id),
      tests: files.filter((x) => re.test(x.text)).map((x) => x.f)
    };
  });
  return { rows };
}

function safeRead(file) {
  try {
    const stat = fs.statSync(file);
    return stat.size > 2_000_000 ? '' : fs.readFileSync(file, 'utf-8');
  } catch {
    return '';
  }
}

export function traceabilityMarkdown(matrix) {
  const lines = ['| Critério | Tarefas | Testes | Status |', '| :-- | :-- | :-- | :-: |'];
  for (const r of matrix.rows) {
    const ok = r.tasks.length && r.tests.length;
    lines.push(`| ${r.ac} | ${r.tasks.join(', ') || '—'} | ${r.tests.map((t) => `\`${t}\``).join(', ') || '—'} | ${ok ? '✅' : '❌'} |`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Specs vivas (deltas) e arquivamento
// ---------------------------------------------------------------------------

export function listDeltaSpecs(change) {
  const dir = path.join(change.dir, 'specs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => path.join(dir, f));
}

// Blocos "### Requisito: Nome" até o próximo ### ou ##.
export function parseRequirementBlocks(text) {
  const blocks = [];
  const lines = text.split('\n');
  let cur = null;
  for (const line of lines) {
    const m = /^###\s+Requisito:\s*(.+?)\s*$/.exec(line);
    if (m) {
      cur = { name: m[1], lines: [line] };
      blocks.push(cur);
    } else if (/^##?\s/.test(line)) {
      cur = null;
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  return blocks.map((b) => ({ name: b.name, body: b.lines.join('\n').replace(/\s+$/, '') }));
}

export function parseDelta(text) {
  const delta = { added: [], modified: [], removed: [] };
  const secs = sections(text);
  for (const [title, body] of secs) {
    const t = title.toLowerCase();
    const key = t.startsWith('adicionad') ? 'added' : t.startsWith('modificad') ? 'modified' : t.startsWith('removid') ? 'removed' : null;
    if (key) delta[key] = parseRequirementBlocks(body);
  }
  return delta;
}

export function mergeSpec(livingText, deltaText, capability) {
  const delta = parseDelta(deltaText);
  const base = livingText || `# ${capability}\n\n## Requisitos\n`;
  const header = base.split(/^###\s+Requisito:/m)[0].replace(/\s+$/, '');
  const blocks = parseRequirementBlocks(base);
  const byName = new Map(blocks.map((b) => [b.name.toLowerCase(), b]));
  const errors = [];
  for (const b of delta.added) {
    if (byName.has(b.name.toLowerCase())) errors.push(`"${b.name}" já existe em ${capability} (use MODIFICADOS).`);
    else { blocks.push(b); byName.set(b.name.toLowerCase(), b); }
  }
  for (const b of delta.modified) {
    const existing = byName.get(b.name.toLowerCase());
    if (!existing) errors.push(`"${b.name}" não existe em ${capability} para ser modificado.`);
    else existing.body = b.body;
  }
  for (const b of delta.removed) {
    const i = blocks.findIndex((x) => x.name.toLowerCase() === b.name.toLowerCase());
    if (i < 0) errors.push(`"${b.name}" não existe em ${capability} para ser removido.`);
    else blocks.splice(i, 1);
  }
  if (errors.length) throw new SddError(`Conflito ao mesclar spec viva: ${errors.join(' ')}`);
  return `${header}\n\n${blocks.map((b) => b.body).join('\n\n')}\n`;
}

export function archiveChange(root, change) {
  if (change.stage !== 'done') throw new SddError(`${change.id} está em "${change.stage}". Só mudanças concluídas (done) podem ser arquivadas.`);
  // Mescla tudo em memória antes de gravar para não deixar specs pela metade.
  const merged = listDeltaSpecs(change).map((file) => {
    const capability = path.basename(file, '.md');
    const target = path.join(root, '.sdd', 'specs', `${capability}.md`);
    const living = fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : null;
    return { target, capability, text: mergeSpec(living, fs.readFileSync(file, 'utf-8'), capability) };
  });
  fs.mkdirSync(path.join(root, '.sdd', 'specs'), { recursive: true });
  for (const m of merged) fs.writeFileSync(m.target, m.text);

  const dest = path.join(root, '.sdd', 'archive', `${today()}-${change.id}`);
  if (fs.existsSync(dest)) throw new SddError(`Destino ${path.relative(root, dest)} já existe.`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(change.dir, dest);

  const changelog = path.join(root, 'CHANGELOG.md');
  const entry = `## ${today()} — ${change.title} (\`${change.id}\`)\n\n` +
    `- Porte: ${change.size}\n` +
    (merged.length ? `- Specs vivas atualizadas: ${merged.map((m) => m.capability).join(', ')}\n` : '') +
    `- Histórico: \`.sdd/archive/${path.basename(dest)}/\`\n`;
  const prev = fs.existsSync(changelog) ? fs.readFileSync(changelog, 'utf-8') : '# Changelog\n';
  const [head, ...rest] = prev.split(/\n(?=## )/);
  fs.writeFileSync(changelog, [head.replace(/\s+$/, ''), entry.replace(/\s+$/, ''), ...rest].join('\n\n') + '\n');
  return { dest, specs: merged.map((m) => path.relative(root, m.target)) };
}

// ---------------------------------------------------------------------------
// Gate de edição (usado pelo hook PreToolUse)
// ---------------------------------------------------------------------------

export const EDITABLE_STAGES = ['implement', 'verify'];

export function protectedPathReason(rel) {
  if (/^\.sdd\/changes\/[^/]+\/meta\.json$/.test(rel)) {
    return 'Esteira SDD: meta.json é controlado pelo CLI. Use "node .sdd/bin/sdd.mjs" (validate/approve) em vez de editar o estado da mudança.';
  }
  if (rel.startsWith('.sdd/bin/') || rel === '.sdd/.gate-state.json') {
    return 'Esteira SDD: o motor (.sdd/bin) e o estado do gate são mantidos pelo plugin e não podem ser editados pelo agente.';
  }
  return null;
}

// Simula a edição do config.json e diz se a seção "gate" mudaria.
// Conteúdo que não vira JSON válido também conta como mudança (falha segura).
export function gateConfigChange(root, tool, params) {
  const file = path.join(root, '.sdd', 'config.json');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '{}';
  let next = current;
  const apply = (text, oldStr, newStr, all) => (all ? text.split(oldStr).join(newStr) : text.replace(oldStr, () => newStr));
  if (tool === 'Write') next = String(params.content ?? '');
  else if (tool === 'Edit') next = apply(current, String(params.old_string ?? ''), String(params.new_string ?? ''), params.replace_all);
  else if (tool === 'MultiEdit') for (const e of params.edits || []) next = apply(next, String(e.old_string ?? ''), String(e.new_string ?? ''), e.replace_all);
  else return false;
  try {
    const before = JSON.parse(current).gate ?? null;
    const after = JSON.parse(next).gate ?? null;
    return JSON.stringify(before) !== JSON.stringify(after);
  } catch {
    return true;
  }
}

export function gateDecision({ root, filePath, env = process.env }) {
  if (!root) return { allow: true, reason: 'sem esteira' };
  const config = loadConfig(root);
  const mode = (env.SDD_GATE || config.gate.mode || 'strict').toLowerCase();
  if (mode === 'off') return { allow: true, reason: 'gate desligado' };
  const rel = path.relative(root, path.resolve(root, filePath)).split(path.sep).join('/');
  if (rel.startsWith('..')) return { allow: true, reason: 'fora do projeto' };
  if (matchesAny(rel, config.gate.allow)) return { allow: true, reason: 'caminho liberado' };
  const changes = listChanges(root);
  if (changes.some((c) => EDITABLE_STAGES.includes(c.stage))) return { allow: true, reason: 'mudança em implementação' };
  const active = changes.filter((c) => c.stage !== 'done');
  const where = active.length
    ? `Mudanças ativas: ${active.map((c) => `${c.id} (${c.stage})`).join(', ')}. Conclua e aprove os artefatos até o estágio "implement".`
    : 'Não há mudança ativa. Crie uma com /sdd:new.';
  return {
    allow: mode !== 'strict',
    warn: mode === 'warn',
    reason: `Esteira SDD: "${rel}" é código de produção e nenhuma mudança está aprovada para implementação. ${where} (Emergência: SDD_GATE=off.)`
  };
}

// ---------------------------------------------------------------------------
// Aprovação humana: o último turno do usuário precisa ser o comando /sdd:approve
// ---------------------------------------------------------------------------

function entryText(entry) {
  const content = entry.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  return '';
}

function isApproveCommand(text) {
  return /<command-name>\/?(?:[\w-]+:)?sdd:approve<\/command-name>/.test(text) || /^\s*\/sdd:approve\b/.test(text);
}

// Lê o transcript (JSONL) de trás para frente: pula a resposta do assistente e os
// resultados de ferramentas, e examina o grupo de mensagens do último turno humano.
// Devolve a linha (índice) do comando /sdd:approve, ou -1.
export function approvalTurnIndex(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return -1;
  const lines = fs.readFileSync(transcriptPath, 'utf-8').trim().split('\n');
  let inHumanTurn = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; }
    if (entry.type === 'assistant') {
      if (inHumanTurn) return -1;
      continue;
    }
    if (entry.type !== 'user') continue;
    const text = entryText(entry);
    if (!text) continue; // só resultados de ferramenta
    inHumanTurn = true;
    if (isApproveCommand(text)) return i;
  }
  return -1;
}

function readGateState(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, '.sdd', '.gate-state.json'), 'utf-8')); } catch { return {}; }
}

function writeGateState(root, state) {
  fs.writeFileSync(path.join(root, '.sdd', '.gate-state.json'), JSON.stringify(state, null, 2) + '\n');
}

// Chamado pelo hook UserPromptSubmit: marca aprovação pendente quando o prompt é
// /sdd:approve e desmarca em qualquer outro prompt.
export function recordPrompt(root, { prompt, sessionId }) {
  const state = readGateState(root);
  if (isApproveCommand(String(prompt || ''))) {
    state.pendingApproval = { session: sessionId || null, at: new Date().toISOString() };
  } else {
    delete state.pendingApproval;
  }
  writeGateState(root, state);
}

// Cada /sdd:approve vale para UMA aprovação. Fonte principal: o registro do hook
// UserPromptSubmit (mesma sessão). Reserva: o último turno humano no transcript.
// O turno usado fica em .sdd/.gate-state.json (fora do git).
export function consumeApproval(root, transcriptPath, sessionId) {
  const state = readGateState(root);
  const index = approvalTurnIndex(transcriptPath);
  const key = index >= 0 ? `${path.basename(transcriptPath)}#${index}` : null;
  const pending = state.pendingApproval;
  const fromPrompt = pending && (!pending.session || !sessionId || pending.session === sessionId);
  if (!fromPrompt) {
    if (!key) return { ok: false, reason: 'missing' };
    if (state.lastApproval === key) return { ok: false, reason: 'used' };
  }
  // Registra os dois sinais como consumidos para que o mesmo turno não aprove de novo.
  delete state.pendingApproval;
  if (key) state.lastApproval = key;
  writeGateState(root, state);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Perfis de padrões (opcionais): templates/profiles/<nome>.md
// ---------------------------------------------------------------------------

const PROFILE_BEGIN = (name) => `<!-- sdd:perfil ${name} início -->`;
const PROFILE_END = (name) => `<!-- sdd:perfil ${name} fim -->`;

export function listProfiles() {
  const dir = path.join(TEMPLATES_DIR, 'profiles');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => {
    const text = fs.readFileSync(path.join(dir, f), 'utf-8');
    const title = (/^#\s+(.+)$/m.exec(text) || [])[1] || f;
    const when = (/^>\s*\*\*Quando usar:\*\*\s*(.+)$/m.exec(text) || [])[1] || '';
    return { name: f.slice(0, -3), title, when, file: path.join(dir, f) };
  });
}

// Copia o perfil para dentro da constituição (entre marcadores) e registra no config.
// Reaplicar substitui o bloco, então atualizar um perfil é idempotente.
export function addProfile(root, name) {
  const profile = listProfiles().find((p) => p.name === name);
  if (!profile) throw new SddError(`Perfil "${name}" não existe. Disponíveis: ${listProfiles().map((p) => p.name).join(', ')}`);
  const constitutionFile = path.join(root, '.sdd', 'constitution.md');
  let text = fs.existsSync(constitutionFile) ? fs.readFileSync(constitutionFile, 'utf-8') : '';
  const body = fs.readFileSync(profile.file, 'utf-8').replace(/^#\s+/m, '### ').replace(/^## /gm, '#### ');
  const block = `${PROFILE_BEGIN(name)}\n${body.trim()}\n${PROFILE_END(name)}`;
  const re = new RegExp(`${escapeRe(PROFILE_BEGIN(name))}[\\s\\S]*?${escapeRe(PROFILE_END(name))}`);
  if (re.test(text)) text = text.replace(re, block);
  else {
    if (!/^## Perfis adotados/m.test(text)) text = text.replace(/\s*$/, '\n\n## Perfis adotados\n\nPadrões opcionais aplicados a este projeto (`sdd profile add`). Em conflito, o que o código já usa prevalece e a divergência vira decisão registrada.\n');
    text = text.replace(/\s*$/, `\n\n${block}\n`);
  }
  fs.writeFileSync(constitutionFile, text);
  const configFile = path.join(root, '.sdd', 'config.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
  config.profiles = [...new Set([...(config.profiles || []), name])];
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
  return profile;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Execução resumida de comandos de verificação (economia de tokens)
// ---------------------------------------------------------------------------

export function shellQuote(arg) {
  if (/^[\w@%+=:,./-]+$/.test(arg)) return arg;
  return `'${String(arg).replace(/'/g, `'\\''`)}'`;
}

export function buildCommand(template, files = []) {
  const quoted = files.map(shellQuote).join(' ');
  if (template.includes('{files}')) return template.replace('{files}', quoted).trim();
  return quoted ? `${template} ${quoted}` : template;
}

const FAILURE_LINE = /(fail|error|✖|✗|×|assert|expected|received|exception|traceback|panic|not ok|cannot|undefined is not|timed? ?out)/i;

// Reduz a saída: no sucesso, só o final (onde ficam os totais); na falha, as linhas
// que indicam erro mais o final. A saída completa fica em .sdd/runs/<nome>.log.
export function summarizeOutput(output, { ok, tailLines = 25, maxFailureLines = 60 } = {}) {
  const lines = output.replace(/\x1b\[[0-9;]*m/g, '').split('\n').map((l) => l.replace(/\s+$/, ''));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  const tail = lines.slice(-tailLines);
  if (ok) return { lines: tail, omitted: Math.max(0, lines.length - tail.length) };
  const tailStart = lines.length - tail.length;
  const failures = [];
  for (let i = 0; i < tailStart && failures.length < maxFailureLines; i++) {
    if (FAILURE_LINE.test(lines[i])) failures.push(lines[i]);
  }
  const picked = failures.length ? [...failures, '…', ...tail] : tail;
  return { lines: picked, omitted: Math.max(0, lines.length - failures.length - tail.length) };
}

export function runCheck(root, name, files = [], { config = loadConfig(root), full = false } = {}) {
  const template = config.commands[name];
  if (template === undefined) throw new SddError(`Comando "${name}" desconhecido. Use: ${Object.keys(config.commands).join(', ')}.`);
  if (!template) throw new SddError(`commands.${name} está vazio em .sdd/config.json. Preencha com /sdd:init ou à mão.`);
  if (name === 'testFocused' && !files.length) throw new SddError('Informe os arquivos de teste: sdd run testFocused <arquivos>.');
  const command = buildCommand(template, files);
  const started = Date.now();
  const r = spawnSync(command, {
    cwd: root, shell: true, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024,
    timeout: config.run.timeoutSeconds * 1000, env: { ...process.env, CI: process.env.CI || '1', FORCE_COLOR: '0' }
  });
  const output = `${r.stdout || ''}${r.stderr ? `\n${r.stderr}` : ''}`;
  const ok = r.status === 0;
  const runsDir = path.join(root, '.sdd', 'runs');
  fs.mkdirSync(runsDir, { recursive: true });
  const logFile = path.join(runsDir, `${name}.log`);
  fs.writeFileSync(logFile, `$ ${command}\n${output}`);
  const summary = full ? { lines: output.split('\n'), omitted: 0 } : summarizeOutput(output, { ok, tailLines: config.run.tailLines, maxFailureLines: config.run.maxFailureLines });
  return {
    name, command, ok,
    status: r.status, timedOut: r.error?.code === 'ETIMEDOUT',
    seconds: Math.round((Date.now() - started) / 100) / 10,
    lines: summary.lines, omitted: summary.omitted,
    log: path.relative(root, logFile)
  };
}

export function reviewMode(change, config) {
  const mode = config.review.mode;
  if (mode && mode !== 'auto') return mode;
  return change.size === 'S' ? 'final' : 'per-slice';
}
