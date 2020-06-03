module.exports = {
  apps: [{
    name: 'bridge-cleaner',
    script: './bin/storj-cleaner.js',
    args: '-c /root/.storx-bridge/config/production',
    env: {
      STORJ_NETWORK: 'STORX',
      STORJ_BRIDGE: 'https://api.storx.io',
      NODE_ENV: 'production'
    }
  }]
};