/**
 * Release signing for the Play upload key, without any secret in the repository.
 *
 * The generated android/ project reads the key from ~/FlexRiders-signing/signing.properties (or the
 * file named by FLEXRIDERS_SIGNING_PROPERTIES). If that file is missing, the release build falls back
 * to the debug key, which Play Console rejects, so an unsigned upload can't happen silently.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// flexriders-release-signing';

const SNIPPET = `
${MARKER}
def flexridersSigning = new Properties()
def flexridersSigningFile = file(System.getenv("FLEXRIDERS_SIGNING_PROPERTIES") ?: "\${System.getProperty('user.home')}/FlexRiders-signing/signing.properties")
if (flexridersSigningFile.exists()) {
    flexridersSigningFile.withInputStream { flexridersSigning.load(it) }
}
android {
    signingConfigs {
        if (flexridersSigning['FLEXRIDERS_UPLOAD_STORE_FILE']) {
            flexridersUpload {
                storeFile file(flexridersSigning['FLEXRIDERS_UPLOAD_STORE_FILE'])
                storePassword flexridersSigning['FLEXRIDERS_UPLOAD_STORE_PASSWORD']
                keyAlias flexridersSigning['FLEXRIDERS_UPLOAD_KEY_ALIAS']
                keyPassword flexridersSigning['FLEXRIDERS_UPLOAD_KEY_PASSWORD']
            }
        }
    }
    buildTypes {
        release {
            if (flexridersSigning['FLEXRIDERS_UPLOAD_STORE_FILE']) {
                signingConfig signingConfigs.flexridersUpload
            }
        }
    }
}
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += SNIPPET;
    }
    return cfg;
  });
};
