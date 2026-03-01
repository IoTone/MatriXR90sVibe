import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

const MATRIX_BACKEND = 'https://matrix.org';

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    https: true,
    host: true,
    proxy: {
      '/_matrix': {
        target: MATRIX_BACKEND,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
