// Copie le jeu (www/) dans docs/jouer/ pour la version web publiée sur GitHub Pages.
// Usage : npm run web
import { cpSync, rmSync } from 'node:fs';
const out = new URL('../docs/jouer/', import.meta.url);
rmSync(out, { recursive: true, force: true });
cpSync(new URL('../www/', import.meta.url), out, { recursive: true });
console.log('Version web copiée dans docs/jouer/');
