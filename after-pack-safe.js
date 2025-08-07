const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  console.log('🧹 Running safe after-pack cleanup...');
  
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productName}.app`,
    'Contents',
    'Resources',
    'app'
  );
  
  const nodeModulesPath = path.join(appPath, 'node_modules');
  
  if (!fs.existsSync(nodeModulesPath)) {
    console.log('node_modules not found in app bundle, skipping cleanup');
    return;
  }
  
  let totalSaved = 0;
  
  // Safe patterns to remove - only documentation and test files
  function cleanDirectory(dirPath, moduleName = '', depth = 0) {
    if (depth > 3) return; // Limit recursion depth
    
    // Skip critical modules entirely
    if (moduleName && (
      moduleName.startsWith('electron') ||
      moduleName.includes('builder') ||
      moduleName === 'app-builder-lib'
    )) {
      return;
    }
    
    try {
      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        
        try {
          const stat = fs.statSync(itemPath);
          
          if (stat.isDirectory()) {
            // Only remove these specific directories
            if (item === 'test' || item === 'tests' || item === '__tests__' ||
                item === 'example' || item === 'examples' || 
                item === 'docs' || item === 'documentation' ||
                item === '.github' || item === 'coverage') {
              const dirSize = getDirSize(itemPath);
              fs.rmSync(itemPath, { recursive: true, force: true });
              totalSaved += dirSize;
              continue;
            }
            
            // Recurse into other directories
            cleanDirectory(itemPath, moduleName || item, depth + 1);
          } else {
            // Only remove safe file types
            const lowerItem = item.toLowerCase();
            if (item.endsWith('.md') && lowerItem !== 'license.md' ||
                item.endsWith('.markdown') ||
                item.endsWith('.map') ||
                lowerItem === 'changelog' ||
                lowerItem === 'history' ||
                lowerItem === 'readme' ||
                lowerItem === 'readme.txt' ||
                lowerItem === '.npmignore' ||
                lowerItem === '.eslintrc' ||
                lowerItem === '.prettierrc') {
              const fileSize = stat.size;
              fs.unlinkSync(itemPath);
              totalSaved += fileSize;
            }
          }
        } catch (e) {
          // Ignore individual file errors
        }
      }
    } catch (e) {
      // Ignore directory errors
    }
  }
  
  function getDirSize(dirPath) {
    let size = 0;
    try {
      const items = fs.readdirSync(dirPath);
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          size += getDirSize(itemPath);
        } else {
          size += stat.size;
        }
      }
    } catch (e) {
      // Ignore errors
    }
    return size;
  }
  
  console.log('Cleaning node_modules safely...');
  cleanDirectory(nodeModulesPath);
  
  // Remove specific large modules we definitely don't need
  const modulesToRemove = [
    '@jest',
    'jest',
    'jsdom',
    '@types',
    'typescript'
  ];
  
  for (const module of modulesToRemove) {
    const modulePath = path.join(nodeModulesPath, module);
    if (fs.existsSync(modulePath)) {
      const dirSize = getDirSize(modulePath);
      console.log(`Removing ${module}...`);
      fs.rmSync(modulePath, { recursive: true, force: true });
      totalSaved += dirSize;
    }
  }
  
  const savedMB = (totalSaved / 1024 / 1024).toFixed(2);
  console.log(`✅ Safe after-pack cleanup complete. Saved ${savedMB} MB`);
};