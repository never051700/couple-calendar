const fs = require('node:fs');
const path = require('node:path');

module.exports = ({ config }) => {
  const configuredPath = process.env.GOOGLE_SERVICES_JSON?.trim();
  const localPath = './google-services.json';
  const selectedPath =
    configuredPath ||
    (fs.existsSync(path.resolve(__dirname, localPath)) ? localPath : null);

  if (
    configuredPath &&
    !fs.existsSync(
      path.isAbsolute(configuredPath)
        ? configuredPath
        : path.resolve(__dirname, configuredPath),
    )
  ) {
    throw new Error(
      `GOOGLE_SERVICES_JSON 파일을 찾을 수 없습니다: ${configuredPath}`,
    );
  }

  return {
    ...config,
    android: {
      ...config.android,
      ...(selectedPath ? { googleServicesFile: selectedPath } : {}),
    },
  };
};
