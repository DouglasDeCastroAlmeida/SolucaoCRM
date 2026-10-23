#!/usr/bin/env node
// CLI da esteira SDD. Os comandos /sdd:* do plugin chamam este script;
// ele também pode ser usado direto no terminal ou no CI (exit code != 0 em falha).
import path from 'node:path';
import * as sdd from './lib.mjs';

const HELP = `Uso: sdd <comando> [opções]

  init [--force]                      Cria .sdd/ (config, constituição, specs, changes, archive)
  new "<título>" [--size S|M|L] [--slug x]
                                      Abre uma mudança e gera o Grill
  status [mudança] [--json]           Estágio, gates e progresso das mudanças
  validate [mudança] [--stage x]      Valida o estágio atual (exit 1 se houver erro)
  approve [mudança] [--by nome] [--note txt] [--force]
                                      Aprova o estágio atual e avança (só após OK humano)
  estimate [mudança] [--json]         Tabela de estimativa com TOTALIZADOR GERAL
  trace [mudança] [--json]            Matriz critério de aceite -> tarefas -> testes
  archive [mudança]                   Mescla specs vivas, move para archive/ e atualiza CHANGELOG
  run <comando> [arquivos...] [--full]
                                      Roda um comando de config.commands e mostra só o resumo
                                      (saída completa em .sdd/runs/<comando>.log)
  profile list                        Perfis de padrões disponíveis
  profile add <nome>                  Aplica um perfil à constituição
  path [mudança]                      Caminho da pasta da mudança
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else args._.push(a);
  }
  return args;
}

function printIssues(issues) {
  for (const i of issues) {
    console.log(`  ${i.level === 'error' ? '✖' : '⚠'} [${i.stage}] ${i.message}`);
  }
}

function stageLine(change) {
  const flow = sdd.FLOWS[change.size];
  return flow.map((s) => (s === change.stage ? `[${s}]` : change.approvals[s] || flow.indexOf(s) < flow.indexOf(change.stage) ? `${s}✓` : s)).join(' → ');
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (!cmd || cmd === 'help' || args.help) {
    console.log(HELP);
    return 0;
  }

  if (cmd === 'init') {
    const root = sdd.findProjectRoot() || process.cwd();
    const created = sdd.initProject(root, { force: Boolean(args.force) });
    console.log(created.length ? `Esteira inicializada em ${root}:\n  ${created.join('\n  ')}` : 'Esteira já estava inicializada (use --force para recriar config e constituição).');
    return 0;
  }

  const root = sdd.requireProjectRoot();
  const config = sdd.loadConfig(root);

  switch (cmd) {
    case 'new': {
      const title = args._.join(' ').trim();
      const change = sdd.createChange(root, { title, size: args.size || 'M', slug: args.slug });
      console.log(`Mudança criada: ${change.id} (porte ${change.size})`);
      console.log(`Fluxo: ${sdd.FLOWS[change.size].join(' → ')}`);
      console.log(`Artefato: ${path.relative(root, path.join(change.dir, sdd.ARTIFACTS.grill))}`);
      return 0;
    }

    case 'status': {
      const changes = args._[0] ? [sdd.resolveChange(root, args._[0])] : sdd.listChanges(root);
      const data = changes.map((c) => {
        const issues = sdd.validateStage(root, c);
        const est = sdd.estimate(root, c, config);
        return { id: c.id, title: c.title, size: c.size, stage: c.stage, flow: stageLine(c), reviewMode: sdd.reviewMode(c, config), errors: issues.filter((i) => i.level === 'error').length, warnings: issues.filter((i) => i.level === 'warning').length, progress: est.totals };
      });
      if (args.json) { console.log(JSON.stringify(data, null, 2)); return 0; }
      if (!data.length) { console.log('Nenhuma mudança. Crie uma com /sdd:new.'); return 0; }
      for (const d of data) {
        console.log(`${d.id} — ${d.title} (porte ${d.size})`);
        console.log(`  ${d.flow}`);
        if (d.progress.tasks) console.log(`  Tarefas: ${d.progress.doneTasks}/${d.progress.tasks} (${d.progress.percent}%) · restante ${sdd.formatDuration(d.progress.pendingMinutes)}`);
        if (d.stage === 'implement') console.log(`  Revisão: ${d.reviewMode}`);
        if (d.stage !== 'done') console.log(`  Gate do estágio atual: ${d.errors ? `${d.errors} erro(s)` : 'pronto para aprovação'}${d.warnings ? `, ${d.warnings} aviso(s)` : ''}`);
      }
      return 0;
    }

    case 'validate': {
      const change = sdd.resolveChange(root, args._[0]);
      const stage = args.stage || change.stage;
      const issues = sdd.validateStage(root, change, stage);
      const errors = issues.filter((i) => i.level === 'error');
      console.log(`${change.id} · estágio ${stage}: ${errors.length ? `${errors.length} erro(s)` : 'OK'}${issues.length - errors.length ? `, ${issues.length - errors.length} aviso(s)` : ''}`);
      printIssues(issues);
      return errors.length ? 1 : 0;
    }

    case 'approve': {
      const change = sdd.resolveChange(root, args._[0]);
      try {
        const r = sdd.approve(root, change, { by: typeof args.by === 'string' ? args.by : undefined, note: typeof args.note === 'string' ? args.note : undefined, force: Boolean(args.force) });
        console.log(`${change.id}: ${r.from} aprovado → ${r.to}${r.issues.some((i) => i.level === 'error') ? ' (FORÇADO, registrado no histórico)' : ''}`);
        if (r.artifact) console.log(`Próximo artefato: ${path.relative(root, r.artifact)}`);
        if (r.to === 'implement') console.log('Código de produção liberado pelo gate para esta mudança.');
        if (r.to === 'done') console.log('Mudança concluída. Rode /sdd:archive para atualizar specs vivas e CHANGELOG.');
        printIssues(r.issues.filter((i) => i.level === 'warning'));
        return 0;
      } catch (e) {
        if (e.issues) { console.log(e.message); printIssues(e.issues); return 1; }
        throw e;
      }
    }

    case 'estimate': {
      const change = sdd.resolveChange(root, args._[0]);
      const est = sdd.estimate(root, change, config);
      if (args.json) console.log(JSON.stringify(est, null, 2));
      else console.log(sdd.estimateMarkdown(est));
      return 0;
    }

    case 'trace': {
      const change = sdd.resolveChange(root, args._[0]);
      const matrix = sdd.traceability(root, change, config);
      if (args.json) console.log(JSON.stringify(matrix, null, 2));
      else console.log(sdd.traceabilityMarkdown(matrix));
      return matrix.rows.every((r) => r.tasks.length && r.tests.length) ? 0 : 1;
    }

    case 'archive': {
      const change = sdd.resolveChange(root, args._[0]);
      const r = sdd.archiveChange(root, change);
      console.log(`Arquivada em ${path.relative(root, r.dest)}`);
      if (r.specs.length) console.log(`Specs vivas atualizadas: ${r.specs.join(', ')}`);
      console.log('CHANGELOG.md atualizado.');
      return 0;
    }

    case 'run': {
      const [name, ...files] = args._;
      if (!name) throw new sdd.SddError('Informe o comando: sdd run <test|testFocused|lint|typecheck|e2e|coverage|security> [arquivos].');
      const r = sdd.runCheck(root, name, files, { config, full: Boolean(args.full) });
      const head = r.ok ? '✔' : '✖';
      console.log(`${head} ${r.name} ${r.ok ? 'passou' : r.timedOut ? 'estourou o tempo' : `falhou (exit ${r.status})`} em ${r.seconds}s · $ ${r.command}`);
      if (r.omitted) console.log(`  (${r.omitted} linha(s) omitida(s); completa em ${r.log})`);
      console.log(r.lines.join('\n'));
      return r.ok ? 0 : 1;
    }

    case 'profile': {
      const [sub, name] = args._;
      if (sub === 'add') {
        if (!name) throw new sdd.SddError('Informe o perfil: sdd profile add <nome>.');
        const p = sdd.addProfile(root, name);
        console.log(`Perfil "${p.name}" aplicado em .sdd/constitution.md e registrado em .sdd/config.json.`);
        return 0;
      }
      const active = new Set(config.profiles || []);
      for (const p of sdd.listProfiles()) {
        console.log(`${active.has(p.name) ? '●' : '○'} ${p.name} — ${p.title}${p.when ? `\n    Quando usar: ${p.when}` : ''}`);
      }
      return 0;
    }

    case 'path': {
      const change = sdd.resolveChange(root, args._[0]);
      console.log(change.dir);
      return 0;
    }

    default:
      console.error(`Comando desconhecido: ${cmd}\n\n${HELP}`);
      return 2;
  }
}

try {
  process.exitCode = main();
} catch (e) {
  if (e instanceof sdd.SddError) {
    console.error(`✖ ${e.message}`);
    process.exitCode = 1;
  } else {
    throw e;
  }
}

