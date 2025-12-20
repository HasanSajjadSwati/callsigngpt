module.exports = {
  apps: [
    {
      name: "callsigngpt-api",
      script: "dist/main.js",
      cwd: "/var/www/callsigngpt/callsigngpt-api",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
      },
      env_production: {
        NODE_ENV: "production",
      },
      watch: false,
      max_memory_restart: "500M",
      time: true
    }
  ]
};
