import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    apple: {
      ...minimal2023Preset.apple,
      padding: 0.15,
      resizeOptions: { background: '#0a0a0b' },
    },
    maskable: {
      ...minimal2023Preset.maskable,
      padding: 0.20,
      resizeOptions: { background: '#0a0a0b' },
    },
  },
  images: ['public/pwa-icon.svg'],
});
