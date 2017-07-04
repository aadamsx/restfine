Package.describe({
  name: 'aadamsx:restfine',
  summary: 'Create authenticated REST APIs in Meteor 0.9+ via HTTP/HTTPS.',
  version: '0.1.0',
});


Package.onUse(function (api) {
  // Minimum Meteor version
  api.versionsFrom('METEOR@1.0.0');

  // Meteor dependencies
  api.use('check');
  api.use('underscore');
  api.use('accounts-password@1.3.3');
  api.use('simple:json-routes@2.1.0');

  api.addFiles('lib/auth.js', 'server');
  api.addFiles('lib/iron-router-error-to-response.js', 'server');
  api.addFiles('lib/route.js', 'server');
  api.addFiles('lib/rest.js', 'server');

  // Exports
  api.export('Restfine', 'server');
});


Package.onTest(function (api) {
  // Meteor dependencies
  api.use('practicalmeteor:munit');
  api.use('nimble:restfine');
  api.use('http');
  api.use('underscore');
  api.use('accounts-base');
  api.use('accounts-password');
  api.use('mongo');

  api.addFiles('lib/route.js', 'server');
});
