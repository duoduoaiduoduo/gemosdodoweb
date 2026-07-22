import fs from 'fs';
const css = fs.readFileSync('src/index.css', 'utf-8');
const lines = css.split('\n');
lines.forEach((line, i) => {
  if (line.includes('backdrop-filter')) {
    console.log(`${i+1}: ${line.trim()}`);
  }
});
