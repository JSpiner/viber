const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

exports.default = async function(context) {
  console.log('🧹 Running safe after-pack cleanup and hardened runtime fix...');
  
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
  
  // Apply hardened runtime to all executables
  console.log('🔐 Applying hardened runtime to all executables...');
  
  const appBundlePath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productName}.app`
  );
  
  const cscName = process.env.CSC_NAME;
  const entitlementsPath = 'build/entitlements.mac.plist';
  
  if (!cscName) {
    console.log('⚠️ CSC_NAME not found, skipping hardened runtime fix');
    return;
  }
  
  if (!fs.existsSync(entitlementsPath)) {
    console.log('⚠️ Entitlements file not found, skipping hardened runtime fix');
    return;
  }
  
  try {
    // Find and sign all helper apps
    const helperApps = execSync(`find "${appBundlePath}" -name "*.app" -type d ! -path "${appBundlePath}"`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    
    for (const helperApp of helperApps) {
      console.log(`  Signing helper: ${path.basename(helperApp)}`);
      execSync(`codesign --force --deep --options runtime --entitlements "${entitlementsPath}" --sign "${cscName}" "${helperApp}"`, { stdio: 'inherit' });
    }
    
    // Find and sign all frameworks
    const frameworks = execSync(`find "${appBundlePath}" -name "*.framework" -type d`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    
    for (const framework of frameworks) {
      console.log(`  Signing framework: ${path.basename(framework)}`);
      execSync(`codesign --force --deep --options runtime --entitlements "${entitlementsPath}" --sign "${cscName}" "${framework}"`, { stdio: 'inherit' });
    }
    
    // Sign other executables
    const executables = execSync(`find "${appBundlePath}" -type f -perm +111 ! -name "*.dylib" ! -name "*.so" | xargs file | grep "Mach-O" | cut -d: -f1`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    
    for (const executable of executables) {
      console.log(`  Signing executable: ${path.basename(executable)}`);
      try {
        execSync(`codesign --force --options runtime --entitlements "${entitlementsPath}" --sign "${cscName}" "${executable}"`, { stdio: 'inherit' });
      } catch (e) {
        // Some executables might fail, continue
      }
    }
    
    // Sign the main app last
    console.log(`  Signing main app: ${path.basename(appBundlePath)}`);
    execSync(`codesign --force --deep --options runtime --entitlements "${entitlementsPath}" --sign "${cscName}" "${appBundlePath}"`, { stdio: 'inherit' });
    
    // Verify hardened runtime
    const verifyOutput = execSync(`codesign -dvvv "${appBundlePath}" 2>&1`, { encoding: 'utf8' });
    if (verifyOutput.includes('flags=') && verifyOutput.includes('runtime')) {
      console.log('✅ Hardened runtime applied successfully');
    } else {
      console.log('⚠️ Hardened runtime may not be applied correctly');
    }
  } catch (error) {
    console.error('❌ Error applying hardened runtime:', error.message);
  }
};