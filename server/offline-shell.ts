import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

export function offlineShell(): Plugin {
  return {
    name: 'noi-offline-shell', apply: 'build', enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const files = Object.keys(bundle).filter(name => name === 'index.html' || /^(assets\/.*\.(js|css)|icons\/noi-v[0-9]+-[0-9]+\.png)$/.test(name)).sort();
        if (!files.includes('index.html') || !files.some(name => name.endsWith('.js'))) throw new Error('Missing app shell');
        const manifest = readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8');
        const template = readFileSync(new URL('../src/pwa/worker.js', import.meta.url), 'utf8');
        const hash = createHash('sha256').update(manifest).update(template);
        for (const name of files) {
          const item = bundle[name];
          hash.update(name).update(item.type === 'chunk' ? item.code : item.source);
        }
        const source = template.replace('__NOI_CACHE__', JSON.stringify(`noi-shell-v1-${hash.digest('hex').slice(0, 20)}`))
          .replace('__NOI_FILES__', JSON.stringify([...files.map(name => `/${name}`), '/manifest.webmanifest']));
        this.emitFile({ type: 'asset', fileName: 'sw.js', source });
      },
    },
  };
}