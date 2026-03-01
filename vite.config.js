import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const MATRIX_BACKEND = env.VITE_MATRIX_BACKEND || 'https://matrix-client.matrix.org';

  return {
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
  };
});
