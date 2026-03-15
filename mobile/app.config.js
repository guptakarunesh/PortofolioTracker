const { expo } = require('./app.json');

module.exports = () => ({
  ...expo,
  ios: {
    ...expo.ios,
    googleServicesFile: process.env.GOOGLE_SERVICE_INFO_PLIST || './GoogleService-Info.plist'
  },
  android: {
    ...expo.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON || './google-services.json'
  }
});
