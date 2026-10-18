import { defineConfig,devices } from '@playwright/test';
export default defineConfig({
  testDir:'tests/pwa',workers:1,
  use:{baseURL:'http://127.0.0.1:4173',...devices['Desktop Chrome'],trace:'retain-on-failure'},
  webServer:{command:'node node_modules/vite/bin/vite.js preview --host 127.0.0.1',url:'http://127.0.0.1:4173',reuseExistingServer:true,timeout:30000}
});
