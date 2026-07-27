// pm2 process supervision for the backend — the "must never die" service.
// Run with: npx pm2 start ecosystem.config.cjs
// Persist across host reboots: npx pm2 save && npx pm2 startup
module.exports = {
  apps: [
    {
      name: "obolus-backend",
      cwd: "./backend",
      script: "src/server.js",
      interpreter: "node",
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 100, // don't give up after a burst of crashes
      min_uptime: "10s", // below this counts as a crash-loop restart, not a healthy run
      exp_backoff_restart_delay: 500, // back off if it keeps crashing immediately
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
