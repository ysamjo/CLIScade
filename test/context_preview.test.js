const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {previewContext}=require('../services/context-preview');
test('Kontextvorschau lädt Regeln und Beads lesend und übernimmt Bild und Budget',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'context-preview-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const project=path.join(root,'project');fs.mkdirSync(project);fs.writeFileSync(path.join(project,'AGENTS.md'),'Regeln');
 let reads=0;const beads={context:async()=>{reads++;return {prime:'Workflow',memories:[{key:'one',text:'Erinnerung'}],ready:[],availableTasks:0};}};
 const result=await previewContext({projectPath:project,prompt:'Prüfen',imageName:'foto.jpg'}, {rootDirectory:root,globalFile:path.join(root,'global'),beads,taskStore:{get:()=>null}});
 assert.match(result.context,/Regeln/);assert.match(result.context,/Erinnerung/);assert.match(result.context,/foto.jpg/);assert.equal(result.characters,result.context.length);assert.equal(result.sources.length,1);assert.equal(reads,1);
 await previewContext({projectPath:project,prompt:'Prüfen',withoutBeads:true},{rootDirectory:root,globalFile:path.join(root,'global'),beads,taskStore:{get:()=>null}});assert.equal(reads,1);
 await assert.rejects(previewContext({projectPath:os.tmpdir(),prompt:'Prüfen'},{rootDirectory:root,beads}),/Workspace/);
});
