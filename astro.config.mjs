import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  build: {
    // We will build to 'dist' by default. 
    // We can later change this to overwrite Flask templates if desired,
    // but for now let's keep it separate to avoid breaking the running app.
    format: 'file'
  }
});
