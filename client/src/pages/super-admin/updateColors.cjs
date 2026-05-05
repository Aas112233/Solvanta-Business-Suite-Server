const fs = require('fs');
const path = require('path');
const dirPath = 'd:/personal project/Solvanta-Business-Suite/client/src/pages/super-admin';
const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.tsx'));

const replacements = [
  [/bg-white/g, 'bg-background-card'],
  [/border-slate-200/g, 'border-border'],
  [/border-slate-300/g, 'border-border-strong'],
  [/border-slate-100/g, 'border-border-subtle'],
  [/border-slate-400/g, 'border-border-strong'],
  [/text-slate-900/g, 'text-text-primary'],
  [/text-slate-800/g, 'text-text-primary'],
  [/text-slate-700/g, 'text-text-secondary'],
  [/text-slate-600/g, 'text-text-secondary'],
  [/text-slate-500/g, 'text-text-tertiary'],
  [/text-slate-400/g, 'text-text-tertiary'],
  [/bg-slate-50/g, 'bg-background-subtle'],
  [/bg-slate-100/g, 'bg-background-subtle'],
  [/hover:bg-slate-50/g, 'hover:bg-background-subtle'],
  [/hover:bg-slate-100/g, 'hover:bg-background-subtle'],
  [/bg-slate-900/g, 'bg-brand'], // standard primary button approach
];

for (const file of files) {
  let content = fs.readFileSync(path.join(dirPath, file), 'utf8');
  for (const [regex, replacement] of replacements) {
    content = content.replace(regex, replacement);
  }
  fs.writeFileSync(path.join(dirPath, file), content);
}
console.log('Files updated successfully!');
