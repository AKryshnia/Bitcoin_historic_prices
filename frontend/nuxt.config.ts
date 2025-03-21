import { defineNuxtConfig } from 'nuxt/config';
export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL || 'http://localhost:5000',
    },
  },

  compatibilityDate: '2025-03-21',
});