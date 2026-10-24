// Prépare le dossier « hosting/ » publié sur Firebase Hosting (https://defimemory.web.app) :
// le jeu à la racine, les pages d'aide et de confidentialité, et le fichier de vérification Android.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url), out = new URL('../hosting/', import.meta.url);
rmSync(out, { recursive: true, force: true });
cpSync(new URL('www/', root), out, { recursive: true });
// Les liens /salon/CODE affichent le jeu : les chemins des fichiers partent de la racine
const index = new URL('index.html', out);
writeFileSync(index, readFileSync(index, 'utf8').replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<base href="/">'));
cpSync(new URL('docs/confidentialite.html', root), new URL('confidentialite.html', out));
cpSync(new URL('docs/privacy.html', root), new URL('privacy.html', out));
// Pages d'aide : sur ce site, le jeu est à la racine et l'aide française s'appelle aide.html
const page = (from, to) => writeFileSync(new URL(to, out), readFileSync(new URL(from, root), 'utf8')
  .replaceAll('href="jouer/"', 'href="/"').replaceAll('href="index.html"', 'href="aide.html"'));
page('docs/index.html', 'aide.html');
page('docs/support.html', 'support.html');
mkdirSync(new URL('.well-known/', out), { recursive: true });
cpSync(new URL('firebase/well-known/assetlinks.json', root), new URL('.well-known/assetlinks.json', out));
console.log('Site Firebase prêt dans hosting/');
