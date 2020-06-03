module.exports = {
  apps: [{
    name: 'bridge-replicator',
    script: './bin/storx-replicator.js',
    cwd: '/root/bridge',
    args: '-c /root/.storx-bridge/config/production',
    env: {
      STORJ_NETWORK: 'STORX',
      STORJ_BRIDGE: 'https://api.storx.io',
      NODE_ENV: 'production'
    }
  }]
};

