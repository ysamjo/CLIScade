const fs=require('node:fs');const path=require('node:path');
const {resolveWorkspaceDirectory}=require('../runtime/workspace');
const {loadRules,gitState,checkpoint,buildContext}=require('./context-service');
async function previewContext(payload,{rootDirectory,globalFile,beads,taskStore}) {
 const directory=resolveWorkspaceDirectory(payload.projectPath,rootDirectory);
 const prompt=String(payload.prompt || '').trim();if(!prompt)throw new Error('Aufgabe für die Kontextvorschau eingeben.');
 const rules=loadRules(directory,rootDirectory,globalFile);const git=gitState(directory);
 const previous=taskStore?.get(payload.previousTaskId || '');
 const prior=previous?.projectPath===directory ? previous.checkpoint || checkpoint(previous,null,'Früherer Stand unbekannt') : null;
 const beadsContext=payload.withoutBeads===true ? null : await beads.context(directory,{prompt});
 const bead=payload.withoutBeads!==true && payload.beadId ? await beads.show(directory,payload.beadId) : null;
 const image=payload.imageName ? path.basename(String(payload.imageName)) : previous?.projectPath===directory && previous.image && fs.existsSync(path.join(directory,path.basename(previous.image))) ? path.basename(previous.image) : null;
 const context=buildContext({rules:rules.rules,prompt,image,previous:prior,git:`${git.revision || 'unbekannt'}\n${git.changes}`,bead,beadsContext});
 const includedMemories=(beadsContext?.memories || []).filter(memory=>context.includes(JSON.stringify(memory))).length;
 return {context,characters:context.length,budget:64000,sources:rules.sources,image,
  memories:includedMemories,omittedMemories:(beadsContext?.omittedMemories || 0)+(beadsContext?.memories?.length || 0)-includedMemories,revision:git.revision};
}
module.exports={previewContext};
