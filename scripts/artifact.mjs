// Turn dist-single/index.html into a body fragment for hosts that supply their own <html>/<head> skeleton.
import fs from 'node:fs';
const html = fs.readFileSync('dist-single/index.html', 'utf8');
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]);
const title = '<title>Aomori Apple Kitchen</title>';
const links = pick(/<link rel="(?:preconnect|stylesheet)"[^>]*>/g);
const styles = pick(/<style[^>]*>[\s\S]*?<\/style>/g);
const scripts = pick(/<script type="module"[^>]*>[\s\S]*?<\/script>/g);
const out = [title, ...links, ...styles, '<div id="root"></div>', ...scripts].join('\n');
fs.writeFileSync('dist-single/aomori-apple-kitchen.html', out);
console.log('fragment bytes', out.length, 'scripts', scripts.length, 'styles', styles.length);
