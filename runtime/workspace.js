const fs = require('node:fs');
const path = require('node:path');

function within(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function resolveWorkspaceDirectory(candidate, rootDirectory) {
  if (typeof candidate !== 'string' || !candidate.trim()) throw new Error('Projektpfad ist ungültig');
  let root;
  let resolved;
  try {
    root = fs.realpathSync(rootDirectory);
    resolved = fs.realpathSync(candidate);
    if (!fs.statSync(resolved).isDirectory()) throw new Error('kein Verzeichnis');
  } catch {
    throw new Error('Projektpfad ist ungültig oder existiert nicht');
  }
  if (!within(resolved, root)) throw new Error('Projektpfad liegt außerhalb des Workspace');
  return resolved;
}

function resolveAgentFile(target, project, rootDirectory) {
  const root = resolveWorkspaceDirectory(rootDirectory, rootDirectory);
  const directory = target === 'rootDev' ? root : resolveWorkspaceDirectory(project, root);
  const file = path.join(directory, 'AGENTS.md');
  try { fs.lstatSync(file); } catch (err) {
    if (err.code === 'ENOENT') return file;
    throw err;
  }
  let actual;
  try { actual = fs.realpathSync(file); } catch { throw new Error('AGENTS.md ist ungültig'); }
  if (!within(actual, directory)) throw new Error('AGENTS.md liegt außerhalb des erlaubten Projektordners');
  return file;
}

module.exports = { resolveWorkspaceDirectory, resolveAgentFile };
