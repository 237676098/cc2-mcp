/**
 * Install cc2-mcp-bridge extension into a Cocos Creator project.
 * Usage: npx ts-node scripts/install-extension.ts <project-path>
 */
import * as fs from 'fs';
import * as path from 'path';

const projectPath = process.argv[2];
if (!projectPath) {
  console.error('Usage: npx ts-node scripts/install-extension.ts <cocos-project-path>');
  process.exit(1);
}

const packagesDir = path.join(projectPath, 'packages');
const targetDir = path.join(packagesDir, 'cc2-mcp-bridge');
const sourceDir = path.resolve(__dirname, '..', 'cc-extension');

if (!fs.existsSync(projectPath)) {
  console.error(`Project path does not exist: ${projectPath}`);
  process.exit(1);
}

// Create packages directory if needed
if (!fs.existsSync(packagesDir)) {
  fs.mkdirSync(packagesDir, { recursive: true });
}

// Copy extension files
function copyDir(src: string, dest: string) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.name === 'node_modules') continue;
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(sourceDir, targetDir);

// Install ws dependency in the extension
const { execSync } = require('child_process');
console.log('Installing ws dependency in extension...');
execSync('npm install ws@8', { cwd: targetDir, stdio: 'inherit' });

console.log(`\nExtension installed to: ${targetDir}`);
console.log('Restart Cocos Creator to load the extension.');
