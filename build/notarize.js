const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Skip notarization in CI or if environment variables are not set
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD || !process.env.APPLE_TEAM_ID) {
    console.log('Skipping notarization: Missing required environment variables');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log('Starting notarization process...');
  console.log(`App: ${appPath}`);
  console.log(`Apple ID: ${process.env.APPLE_ID}`);
  console.log(`Team ID: ${process.env.APPLE_TEAM_ID}`);

  try {
    await notarize({
      tool: 'notarytool',
      appBundleId: 'io.jspiner.viber',
      appPath: appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
      timeout: 1000 * 60 * 10, // 10 minutes timeout
    });
    
    console.log('✅ Notarization successful!');
  } catch (error) {
    console.error('❌ Notarization failed:', error.message);
    throw error;
  }
};