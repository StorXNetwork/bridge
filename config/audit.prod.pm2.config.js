module.exports = {
  apps: [{
    name: 'bridge-audit',
    script: './bin/storj-audit-tool.js',
    cwd: '/root/bridge',
    args: '-c /root/.storx-bridge/config/production - o /root/shards',
    env: {
      STORJ_NETWORK: 'STORX',
      STORJ_BRIDGE: 'https://api.storx.io',
      NODE_ENV: 'production'
    }
  }]
};

