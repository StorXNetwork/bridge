module.exports = {
  apps: [{
    name: 'bridge-renewal',
    script: './bin/storj-contract-renew.js',
    cwd: '/root/bridge',
    args: '-c /root/.storx-bridge/config/production',
    env: {
      STORJ_NETWORK: 'STORXX',
      STORJ_BRIDGE: 'https://api.storx.io',
      NODE_ENV: 'production'
    }
  }]
};

