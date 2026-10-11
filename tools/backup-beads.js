// Einmalige Sicherung vorhandener Projektdaten; keine automatische Beads-Einrichtung.
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const { BeadsAdapter } = require('../services/beads-adapter');
const { BeadsBackupService, defaultNas } = require('../services/beads-backup');
async function main() {
 const args = process.argv.slice(2); const beads = new BeadsAdapter();
 const service = new BeadsBackupService({beads,stateDirectory:path.join(os.homedir(),'.harness-dispatch'),nas:defaultNas()});
 const find = (root, depth = 0) => {
  if (beads.enabled(root)) return [root];
  if (depth >= 2) return [];
  return fs.readdirSync(root,{withFileTypes:true}).filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'Archiv')
   .flatMap(e => find(path.join(root,e.name),depth+1));
 };
 if (!args.length) throw new Error('Projektpfad oder --all <Workspace> angeben');
 const projects = args[0] === '--all' ? find(path.resolve(args[1] || path.join(os.homedir(),'Developer'))) : args.map(p => path.resolve(p));
 for (const [index,project] of projects.entries()) {
  if (!beads.enabled(project)) throw new Error(`Beads fehlt in ${project}`);
  await service.request(project);
  const status = service.status(project);
  console.log(`${index+1}/${projects.length} ${path.basename(project)}: lokal ${status.local}`);
  if (status.local !== 'verified') process.exitCode = 1;
 }
 service.stop();
}
main().catch(error => { console.error(error.message);process.exitCode = 1; });
