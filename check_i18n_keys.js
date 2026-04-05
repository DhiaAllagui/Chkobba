const fs = require('fs');
const path = require('path');
const file = fs.readFileSync(path.join(__dirname,'js','i18n.js'),'utf8');
const m = file.match(/const translations = \{([\s\S]*)\};\s*window\.translations/);
if(!m){ console.error('parse fail'); process.exit(1); }
const objText = '({' + m[1].replace(/([a-zA-Z0-9_]+):/g, '"$1":') + '})';
const translations = eval(objText);
const enKeys = Object.keys(translations.en).sort();
const arKeys = Object.keys(translations.ar).sort();
const frKeys = Object.keys(translations.fr).sort();
const missingInAr = enKeys.filter(k=>!arKeys.includes(k));
const missingInFr = enKeys.filter(k=>!frKeys.includes(k));
console.log('en', enKeys.length, 'ar', arKeys.length, 'fr', frKeys.length);
console.log('missingInAr', JSON.stringify(missingInAr, null, 2));
console.log('missingInFr', JSON.stringify(missingInFr, null, 2));
