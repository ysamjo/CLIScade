module.exports = {
  build({ prompt, model }) {
    const args = ['-p', '-y'];
    if (model && model !== 'Standard') args.push('--model', model);
    args.push(prompt);
    return args;
  }
};
