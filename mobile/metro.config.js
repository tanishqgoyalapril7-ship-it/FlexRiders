const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.projectRoot = __dirname;
config.watchFolders = [__dirname];

config.resolver.blockList = [
  new RegExp(`^${path.resolve(__dirname, '..', 'backend')}.*`),
  new RegExp(`^${path.resolve(__dirname, '..', 'frontend')}.*`),
  new RegExp(`^${path.resolve(__dirname, '..', 'docs')}.*`),
];

module.exports = config;
