module.exports = {
  build({ prompt, model }) {
    const args = ['-p', prompt, '--dangerously-skip-permissions'];
    if (model && model !== 'Standard') args.push('-m', model);
    return args;
  }
};
