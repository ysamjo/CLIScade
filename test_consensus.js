const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => {
  console.log('WS connected. Sending test dispatch with consensus mode...');
  ws.send(JSON.stringify({
    type: 'dispatch',
    prompt: 'Gib mir in 1 Satz eine Definition von Software-Architektur.',
    harnessOverride: 'consensus',
    projectPath: '/Users/family/.gemini/antigravity/scratch/harness-studio'
  }));
});

ws.on('message', (msg) => {
  const data = JSON.parse(msg.toString());
  if (data.type === 'route_selected') {
    console.log('Route selected:', data.harness, 'model:', data.model);
  } else if (data.type === 'output') {
    if (data.html && (data.html.includes('Phase') || data.html.includes('KONSENS'))) {
      const clean = data.html.replace(/<[^>]+>/g, '').trim();
      console.log('Output phase:', clean);
    }
  } else if (data.type === 'done') {
    console.log('Dispatch done! ExitCode:', data.exitCode, 'Message:', data.message);
    ws.close();
    process.exit(0);
  } else if (data.type === 'error') {
    console.log('Dispatch error:', data.message);
    ws.close();
    process.exit(1);
  }
});

setTimeout(() => {
  console.log('Timeout reached after 35s');
  ws.close();
  process.exit(0);
}, 35000);
