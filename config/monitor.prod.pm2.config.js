module.exports = {
  apps: [{
    name: 'bridge-monitor',
    script: './bin/storj-monitor.js',
    args: '-c /root/.storx-bridge/config/production',
    env: {
      STORJ_NETWORK: 'STORX',
      STORJ_BRIDGE: 'https://api.storx.io',
      NODE_ENV: 'production'
    }
  }]
};
