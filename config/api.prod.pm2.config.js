module.exports = {
  apps: [{
    name: 'bridge-api',
    script: './bin/storj-bridge.js',
    env: {
      STORJ_NETWORK: 'STORX',
      STORJ_BRIDGE: 'https://api.storx.io',
      NODE_ENV: 'production'
    }
  }]
};
