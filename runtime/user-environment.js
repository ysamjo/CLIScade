const {execFileSync}=require('node:child_process');
// Nur Nutzer-/Provider-Konfiguration; keine Sitzungsmarker oder App-Shims laden.
const allowed=name=> /^ANTHROPIC_[A-Z0-9_]+$/.test(name) || /^CLAUDE_CODE_USE_[A-Z0-9_]+$/.test(name) || [
 'CLAUDE_CONFIG_DIR','CLAUDE_CODE_SUBAGENT_MODEL','CLAUDE_CODE_EFFORT_LEVEL',
 'AWS_REGION','AWS_DEFAULT_REGION','AWS_PROFILE','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN',
 'AWS_SHARED_CREDENTIALS_FILE','AWS_CONFIG_FILE','AWS_BEARER_TOKEN_BEDROCK','GOOGLE_APPLICATION_CREDENTIALS',
 'ANTHROPIC_VERTEX_PROJECT_ID','CLOUD_ML_REGION','AZURE_FOUNDRY_API_KEY','AZURE_FOUNDRY_RESOURCE',
 'JUNIE_API_KEY','KIRO_API_KEY','COPILOT_GITHUB_TOKEN','GH_TOKEN','GITHUB_TOKEN','MISTRAL_API_KEY','VIBE_HOME',
 'HTTP_PROXY','HTTPS_PROXY','NO_PROXY','NODE_EXTRA_CA_CERTS'
].includes(name);
class UserEnvironment {
 constructor({env=process.env,read}={}) {
  this.env=env;this.loaded=null;this.loadedAt=null;
  this.read=read || (()=>execFileSync(env.SHELL || '/bin/zsh',['-lic','env'],{encoding:'utf8',timeout:6000,maxBuffer:1024*1024,
   env:{HOME:env.HOME,USER:env.USER,LOGNAME:env.LOGNAME,PATH:env.PATH,TERM:'xterm-256color'},stdio:['ignore','pipe','ignore']}));
 }
 reload() {
  let output;try{output=this.read();}catch{throw new Error('Shell-Konfiguration konnte nicht geladen werden; bisheriger Stand bleibt aktiv.');}
  const loaded={};let shellPath='';
  for(const line of output.split('\n')){const match=/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);if(!match)continue;
   if(allowed(match[1]) && match[2])loaded[match[1]]=match[2];if(match[1]==='PATH')shellPath=match[2];}
  if(shellPath)loaded.PATH=[...new Set([...(this.env.PATH || '').split(':'),...shellPath.split(':')])].filter(p=>p && !p.includes('cli/vendor/shim')).join(':');
  this.loaded=loaded;this.loadedAt=new Date().toISOString();return this.status();
 }
 environment(){if(this.loaded===null)this.reload();return {...this.loaded,...this.env,PATH:this.loaded.PATH || this.env.PATH};}
 status(){return {loadedAt:this.loadedAt,names:Object.keys(this.loaded || {}).filter(name=>name!=='PATH').sort()};}
}
module.exports={UserEnvironment,allowed};
