const test=require('node:test');const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
test('Launcher erkennt Node aus dem Nutzer-PATH und lehnt alte Versionen ab',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'launcher-test-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const node=path.join(directory,'node');fs.writeFileSync(node,'#!/bin/sh\necho v22.13.0\n',{mode:0o755});
 const code=`import runpy\nm=runpy.run_path(${JSON.stringify(path.join(__dirname,'../tools/start-detached.py'))})\nprint(m['find_node']({'PATH':${JSON.stringify(directory)}}))`;
 assert.equal(execFileSync('python3',['-c',code],{encoding:'utf8'}).trim(),node);
 fs.writeFileSync(node,'#!/bin/sh\necho v20.0.0\n');
 assert.throws(()=>execFileSync('python3',['-c',code.replace("{'PATH':","{'HARNESS_NODE':"+JSON.stringify(node)+",'PATH':")],{stdio:'pipe'}));
});
