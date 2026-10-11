// Offizieller Einmalauftrag; --prompt würde stattdessen die TUI öffnen.
// json-stream ist dokumentiert, dessen Ereignisschema jedoch nicht: Textmodus
// liefert keine belastbaren Werkzeugbelege oder native Session-Fortsetzung.
module.exports = {
  build({ prompt, model, cwd }) {
    const args = ['--skip-update-check', '--output-format', 'text', '--project', cwd];
    if (model && model !== 'Standard') args.push('--model', model);
    args.push('--task', prompt);
    return args;
  },
  detectFailure(raw) {
    return raw.split('\n').find(line => /^(?:error:|authentication (?:failed|required)|not authenticated|quota exceeded|insufficient credits|permission denied)/i.test(line.trim()));
  }
};
