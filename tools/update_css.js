const fs = require('fs');
let css = fs.readFileSync('src/index.css', 'utf-8');

// 1. Remove backdrop-filter globally
css = css.replace(/backdrop-filter:\s*[^;]+;/g, '');
css = css.replace(/-webkit-backdrop-filter:\s*[^;]+;/g, '');

// 2. Specific replacements
const replacements = [
  // .detail-close-btn
  ['border: 1px solid rgba(255,255,255,0.58);', ''],
  ['border-color: rgba(255,255,255,0.84);', ''],
  
  // Desktop light-mode floating entries
  ['border-color: rgba(15, 23, 42, 0.22) !important;', ''],
  ['inset 0 0 0 1px rgba(255,255,255,0.55)', ''],
  ['border-color: rgba(15, 23, 42, 0.24) !important;', ''],
  ['border-color: rgba(15, 23, 42, 0.36) !important;', ''],
  ['inset 0 0 0 1px rgba(255,255,255,0.72)', ''],
  
  // roller-card-shell
  ['border: 1px solid rgba(255,255,255,0.08);', ''],
  ['inset 0 1px 0 rgba(255,255,255,0.08),', ''],
  ['border-color: rgba(255,255,255,0.16);', ''],
  ['inset 0 1px 0 rgba(255,255,255,0.12),', ''],
  ['border-color: rgba(255,255,255,0.06);', ''],
  
  // Clean up backgrounds of roller to be pure solid
  ['background: linear-gradient(180deg, rgba(20, 20, 20, 0.54), rgba(20, 20, 20, 0.3));', 'background: var(--bg-overlay-light);'],
  ['background: linear-gradient(180deg, rgba(28, 28, 28, 0.68), rgba(18, 18, 18, 0.46));', 'background: var(--panel-bg);'],
  ['background: linear-gradient(180deg, rgba(24, 24, 24, 0.44), rgba(18, 18, 18, 0.24));', 'background: var(--bg-overlay-medium);'],

  // filter-icon
  ['border: 1px solid var(--border-color);', ''],
  ['border-color: var(--primary-color);', ''],
  
  // awards nav item
  ['border: 1px solid rgba(255,255,255,0.35);', ''],
  
  // floating entries
  ['border: 1px solid rgba(255,255,255,0.72);', ''],
  ['border: 1px solid rgba(255,255,255,0.4);', ''],
  
  // modal overlay
  ['border: 1px solid var(--border-color);', ''],
];

replacements.forEach(([from, to]) => {
  css = css.split(from).join(to);
});

// For things like background gradients inside light/dark themes:
css = css.replace(/background:\s*linear-gradient\([^)]+\)/g, (match) => {
    if (match.includes('135deg') || match.includes('145deg')) {
       // those are the floating buttons background. Make them solid
       if (match.includes('rgba(255,255,255,0.94)')) return 'background: var(--panel-bg)';
       if (match.includes('rgba(255,255,255,0.98)')) return 'background: var(--bg-color)';
    }
    return match;
});

// floating entries background (rgba(255,255,255,0.1))
css = css.replace(/background: rgba\(255,255,255,0\.1\);/g, 'background: var(--panel-bg);');
css = css.replace(/background: rgba\(255,255,255,0\.16\);/g, 'background: var(--bg-color);');
css = css.replace(/background: rgba\(255,255,255,0\.14\);/g, 'background: var(--panel-bg);');

fs.writeFileSync('src/index.css', css, 'utf-8');
console.log('✅ CSS updated successfully.');
