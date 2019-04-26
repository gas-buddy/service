module.exports = function babelConfig(api) {
  api.cache.forever();
  return {
    presets: ['gasbuddy'],
    sourceMap: 'inline',
  };
};
