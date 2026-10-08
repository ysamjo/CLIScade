module.exports = {
  build({ prompt, model }) {
    const args = ['--print', prompt, '--dangerously-skip-permissions'];
    if (model && model !== 'Standard') args.push('--model', model);
    return args;
  }
};
