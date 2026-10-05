import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { knowledgeFilesPlugin } from './src/build/knowledgeFiles.js';

// GitHub Pages cannot send response headers, so production builds carry the Content Security Policy
// as a <meta> tag. T24Tools makes no network calls: everything, including uploaded routines and
// logs, stays in the browser. The embedded tools are same-site pages loaded into sandboxed frames.
// The dev server is excluded because React Refresh relies on an inline script.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const cspPlugin = {
  name: 't24tools-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
      injectTo: 'head-prepend',
    },
  ],
};

// GitHub Pages serves the app from /T24Tools/. Preview uses the same base so E2E can run against the
// production bundle exactly as it is deployed; the dev server stays at the root for convenience.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/T24Tools/' : '/',
  plugins: [react(), cspPlugin, knowledgeFilesPlugin()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
}));
