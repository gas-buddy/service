export function getNodeEnv() {
  switch (process.env.NODE_ENV) {
    case 'production':
    case 'staging':
    case 'test':
      return process.env.NODE_ENV;
    default:
      return 'development';
  }
}

export function isDev() {
  return getNodeEnv() === 'development';
}
