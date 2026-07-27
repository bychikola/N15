// PM2 configuration for N15
module.exports = {
  apps: [
    {
      name: 'n15',
      script: 'node_modules/.bin/next',
      args: 'start --port 3000',
      cwd: '/var/www/n15',
      env: {
        NODE_ENV: 'production',
        PAYLOAD_SECRET: process.env.PAYLOAD_SECRET || 'change-this-to-random-string',
        DATABASE_URL: process.env.DATABASE_URL || 'file:./n15.db',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
}
