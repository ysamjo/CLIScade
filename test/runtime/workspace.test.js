const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveWorkspaceDirectory, resolveAgentFile } = require('../../runtime/workspace');

test('Workspace lehnt fehlende Ordner und Symlink-Ausbrüche ab', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-workspace-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-outside-'));
  fs.mkdirSync(path.join(root, 'projekt'));
  fs.symlinkSync(outside, path.join(root, 'escape'));
  assert.equal(resolveWorkspaceDirectory(path.join(root, 'projekt'), root), fs.realpathSync(path.join(root, 'projekt')));
  assert.throws(() => resolveWorkspaceDirectory(path.join(root, 'escape'), root), /außerhalb/);
  assert.throws(() => resolveWorkspaceDirectory(path.join(root, 'fehlend'), root), /ungültig/);
  fs.writeFileSync(path.join(outside, 'AGENTS.md'), 'außerhalb');
  fs.symlinkSync(path.join(outside, 'AGENTS.md'), path.join(root, 'projekt', 'AGENTS.md'));
  assert.throws(() => resolveAgentFile('project', path.join(root, 'projekt'), root), /außerhalb/);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});
