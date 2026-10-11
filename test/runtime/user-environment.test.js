const test = require('node:test'); const assert = require('node:assert/strict');
const {UserEnvironment} = require('../../runtime/user-environment');
test('Nutzerkonfiguration lädt zusätzliche Provider und kann ohne Neustart erneuert werden', () => {
 let output='ANTHROPIC_BASE_URL=http://first\nCLAUDE_CODE_USE_BEDROCK=1\nAWS_REGION=eu-central-1\nCLAUDE_CONFIG_DIR=/custom\nNODE_OPTIONS=unsafe\nPATH=/cli/vendor/shim:/custom/bin';
 const service=new UserEnvironment({env:{HOME:'/home/test',PATH:'/usr/bin'},read:()=>output});
 assert.equal(service.environment().CLAUDE_CODE_USE_BEDROCK,'1');
 assert.equal(service.environment().CLAUDE_CONFIG_DIR,'/custom');
 assert.equal(service.environment().NODE_OPTIONS,undefined);
 assert.ok(!service.environment().PATH.includes('shim'));
 output='ANTHROPIC_BASE_URL=http://second'; service.reload();
 assert.equal(service.environment().ANTHROPIC_BASE_URL,'http://second');
 assert.equal(service.environment().CLAUDE_CODE_USE_BEDROCK,undefined);
 assert.ok(!JSON.stringify(service.status()).includes('http://second'));
});
test('Startumgebung hat Vorrang und Ladefehler behalten den letzten Stand',()=>{
 let fail=false;const service=new UserEnvironment({env:{ANTHROPIC_MODEL:'explicit'},read:()=>{if(fail)throw Error('secret');return 'ANTHROPIC_MODEL=shell';}});
 assert.equal(service.environment().ANTHROPIC_MODEL,'explicit');fail=true;
 assert.throws(()=>service.reload(),/Shell-Konfiguration/);assert.equal(service.environment().ANTHROPIC_MODEL,'explicit');
});

test('Neue CLI-Anmeldedaten laden nur freigegebene Namen und Status enthält keine Werte',()=>{
 const names=['JUNIE_API_KEY','KIRO_API_KEY','COPILOT_GITHUB_TOKEN','GH_TOKEN','GITHUB_TOKEN','MISTRAL_API_KEY'];
 const service=new UserEnvironment({env:{HOME:'/tmp/test',PATH:'/usr/bin'},read:()=>names.map(n=>`${n}=secret-test`).join('\n')+'\nKIRO_UNSAFE=1\nVIBE_AUTO_APPROVE=1'});
 const environment=service.environment();
 for(const name of names)assert.equal(environment[name],'secret-test');
 assert.equal(environment.KIRO_UNSAFE,undefined);assert.equal(environment.VIBE_AUTO_APPROVE,undefined);
 assert.ok(!JSON.stringify(service.status()).includes('secret-test'));
});
