import Route from '/./lib/route';
import Auth from '/./lib/auth';

let Restfine;

const indexOf = [].indexOf || function(item) { for (let i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

Restfine = ((() => {
  class Restfine {
    constructor(options) {
      let corsHeaders;
      this._routes = [];
      this._config = {
        paths: [],
        useDefaultAuth: false,
        apiPath: 'api/',
        version: null,
        prettyJson: false,
        auth: {
          token: 'services.resume.loginTokens.hashedToken',
          user() {
            let token;
            if (this.request.headers['x-auth-token']) {
              token = Accounts._hashLoginToken(this.request.headers['x-auth-token']);
            }
            return {
              userId: this.request.headers['x-user-id'],
              token
            };
          }
        },
        defaultHeaders: {
          'Content-Type': 'application/json'
        },
        enableCors: true
      };
      _.extend(this._config, options);
      if (this._config.enableCors) {
        corsHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
        };
        if (this._config.useDefaultAuth) {
          corsHeaders['Access-Control-Allow-Headers'] += ', X-User-Id, X-Auth-Token';
        }
        _.extend(this._config.defaultHeaders, corsHeaders);
        if (!this._config.defaultOptionsEndpoint) {
          this._config.defaultOptionsEndpoint = function() {
            this.response.writeHead(200, corsHeaders);
            return this.done();
          };
        }
      }
      if (this._config.apiPath[0] === '/') {
        this._config.apiPath = this._config.apiPath.slice(1);
      }
      if (_.last(this._config.apiPath) !== '/') {
        this._config.apiPath = `${this._config.apiPath}/`;
      }
      if (this._config.version) {
        this._config.apiPath += `${this._config.version}/`;
      }
      if (this._config.useDefaultAuth) {
        this._initAuth();
      } else if (this._config.useAuth) {
        this._initAuth();
        console.warn('Warning: useAuth API config option will be removed in Restfine v1.0 ' + '\n    Use the useDefaultAuth option instead');
      }
      return this;
    }

    /**
      Add endpoints for the given HTTP methods at the given path

      @param path {String} The extended URL path (will be appended to base path of the API)
      @param options {Object} Route configuration options
      @param options.authRequired {Boolean} The default auth requirement for each endpoint on the route
      @param options.roleRequired {String or String[]} The default role required for each endpoint on the route
      @param endpoints {Object} A set of endpoints available on the new route (get, post, put, patch, delete, options)
      @param endpoints.<method> {Function or Object} If a function is provided, all default route
          configuration options will be applied to the endpoint. Otherwise an object with an `action`
          and all other route config options available. An `action` must be provided with the object.
     */

    addRoute(path, options, endpoints) {
      let route;
      route = new Route(this, path, options, endpoints);
      this._routes.push(route);
      route.addToApi();
      return this;
    }

    /**
      Generate routes for the Meteor Collection with the given name
     */

    addCollection(collection, options) {
      let collectionEndpoints;
      let collectionRouteEndpoints;
      let endpointsAwaitingConfiguration;
      let entityRouteEndpoints;
      let excludedEndpoints;
      let methods;
      let methodsOnCollection;
      let path;
      let routeOptions;
      if (options == null) {
        options = {};
      }
      methods = ['get', 'post', 'put', 'patch', 'delete', 'getAll'];
      methodsOnCollection = ['post', 'getAll'];
      if (collection === Meteor.users) {
        collectionEndpoints = this._userCollectionEndpoints;
      } else {
        collectionEndpoints = this._collectionEndpoints;
      }
      endpointsAwaitingConfiguration = options.endpoints || {};
      routeOptions = options.routeOptions || {};
      excludedEndpoints = options.excludedEndpoints || [];
      path = options.path || collection._name;
      collectionRouteEndpoints = {};
      entityRouteEndpoints = {};
      if (_.isEmpty(endpointsAwaitingConfiguration) && _.isEmpty(excludedEndpoints)) {
        _.each(methods, function(method) {
          if (indexOf.call(methodsOnCollection, method) >= 0) {
            _.extend(collectionRouteEndpoints, collectionEndpoints[method].call(this, collection));
          } else {
            _.extend(entityRouteEndpoints, collectionEndpoints[method].call(this, collection));
          }
        }, this);
      } else {
        _.each(methods, function(method) {
          let configuredEndpoint;
          let endpointOptions;
          if (indexOf.call(excludedEndpoints, method) < 0 && endpointsAwaitingConfiguration[method] !== false) {
            endpointOptions = endpointsAwaitingConfiguration[method];
            configuredEndpoint = {};
            _.each(collectionEndpoints[method].call(this, collection), (action, methodType) => configuredEndpoint[methodType] = _.chain(action).clone().extend(endpointOptions).value());
            if (indexOf.call(methodsOnCollection, method) >= 0) {
              _.extend(collectionRouteEndpoints, configuredEndpoint);
            } else {
              _.extend(entityRouteEndpoints, configuredEndpoint);
            }
          }
        }, this);
      }
      this.addRoute(path, routeOptions, collectionRouteEndpoints);
      this.addRoute(`${path}/:id`, routeOptions, entityRouteEndpoints);
      return this;
    }

    /*
      Add /login and /logout endpoints to the API
     */

    _initAuth() {
      let logout;
      let self;
      self = this;

      /*
        Add a login endpoint to the API

        After the user is logged in, the onLoggedIn hook is called (see Restfully.configure() for
        adding hook).
       */
      this.addRoute('login', {
        authRequired: false
      }, {
        post() {
          let auth;
          let e;
          let extraData;
          let password;
          let ref;
          let ref1;
          let response;
          let searchQuery;
          let user;
          user = {};
          if (this.bodyParams.user) {
            if (!this.bodyParams.user.includes('@')) {
              user.username = this.bodyParams.user;
            } else {
              user.email = this.bodyParams.user;
            }
          } else if (this.bodyParams.username) {
            user.username = this.bodyParams.username;
          } else if (this.bodyParams.email) {
            user.email = this.bodyParams.email;
          }
          password = this.bodyParams.password;
          if (this.bodyParams.hashed) {
            password = {
              digest: password,
              algorithm: 'sha-256'
            };
          }
          try {
            auth = Auth.loginWithPassword(user, password);
          } catch (_error) {
            e = _error;
            return {
              statusCode: e.error,
              body: {
                status: 'error',
                message: e.reason
              }
            };
          }
          if (auth.userId && auth.authToken) {
            searchQuery = {};
            searchQuery[self._config.auth.token] = Accounts._hashLoginToken(auth.authToken);
            this.user = Meteor.users.findOne({
              '_id': auth.userId
            }, searchQuery);
            this.userId = (ref = this.user) != null ? ref._id : void 0;
          }
          response = {
            status: 'success',
            data: auth
          };
          extraData = (ref1 = self._config.onLoggedIn) != null ? ref1.call(this) : void 0;
          if (extraData != null) {
            _.extend(response.data, {
              extra: extraData
            });
          }
          return response;
        }
      });
      logout = function() {
        let authToken;
        let extraData;
        let hashedToken;
        let index;
        let ref;
        let response;
        let tokenFieldName;
        let tokenLocation;
        let tokenPath;
        let tokenRemovalQuery;
        let tokenToRemove;
        authToken = this.request.headers['x-auth-token'];
        hashedToken = Accounts._hashLoginToken(authToken);
        tokenLocation = self._config.auth.token;
        index = tokenLocation.lastIndexOf('.');
        tokenPath = tokenLocation.substring(0, index);
        tokenFieldName = tokenLocation.substring(index + 1);
        tokenToRemove = {};
        tokenToRemove[tokenFieldName] = hashedToken;
        tokenRemovalQuery = {};
        tokenRemovalQuery[tokenPath] = tokenToRemove;
        Meteor.users.update(this.user._id, {
          $pull: tokenRemovalQuery
        });
        response = {
          status: 'success',
          data: {
            message: 'You\'ve been logged out!'
          }
        };
        extraData = (ref = self._config.onLoggedOut) != null ? ref.call(this) : void 0;
        if (extraData != null) {
          _.extend(response.data, {
            extra: extraData
          });
        }
        return response;
      };

      /*
        Add a logout endpoint to the API

        After the user is logged out, the onLoggedOut hook is called (see Restfully.configure() for
        adding hook).
       */
      return this.addRoute('logout', {
        authRequired: true
      }, {
        get() {
          console.warn("Warning: Default logout via GET will be removed in Restfine v1.0. Use POST instead.");
          console.warn("    See https://github.com/kahmali/meteor-Restfine/issues/100");
          return logout.call(this);
        },
        post: logout
      });
    }
  }


  /**
    A set of endpoints that can be applied to a Collection Route
   */

  Restfine.prototype._collectionEndpoints = {
    get(collection) {
      return {
        get: {
          action() {
            let entity;
            entity = collection.findOne(this.urlParams.id);
            if (entity) {
              return {
                status: 'success',
                data: entity
              };
            } else {
              return {
                statusCode: 404,
                body: {
                  status: 'fail',
                  message: 'Item not found'
                }
              };
            }
          }
        }
      };
    },
    put(collection) {
      return {
        put: {
          action() {
            let entity;
            let entityIsUpdated;
            entityIsUpdated = collection.update(this.urlParams.id, this.bodyParams);
            if (entityIsUpdated) {
              entity = collection.findOne(this.urlParams.id);
              return {
                status: 'success',
                data: entity
              };
            } else {
              return {
                statusCode: 404,
                body: {
                  status: 'fail',
                  message: 'Item not found'
                }
              };
            }
          }
        }
      };
    },
    patch(collection) {
      return {
        patch: {
          action() {
            let entity;
            let entityIsUpdated;
            entityIsUpdated = collection.update(this.urlParams.id, {
              $set: this.bodyParams
            });
            if (entityIsUpdated) {
              entity = collection.findOne(this.urlParams.id);
              return {
                status: 'success',
                data: entity
              };
            } else {
              return {
                statusCode: 404,
                body: {
                  status: 'fail',
                  message: 'Item not found'
                }
              };
            }
          }
        }
      };
    },
    "delete"(collection) {
      return {
        "delete": {
          action() {
            if (collection.remove(this.urlParams.id)) {
              return {
                status: 'success',
                data: {
                  message: 'Item removed'
                }
              };
            } else {
              return {
                statusCode: 404,
                body: {
                  status: 'fail',
                  message: 'Item not found'
                }
              };
            }
          }
        }
      };
    },
    post(collection) {
      return {
        post: {
          action() {
            let entity;
            let entityId;
            entityId = collection.insert(this.bodyParams);
            entity = collection.findOne(entityId);
            if (entity) {
              return {
                statusCode: 201,
                body: {
                  status: 'success',
                  data: entity
                }
              };
            } else {
              return {
                statusCode: 400,
                body: {
                  status: 'fail',
                  message: 'No item added'
                }
              };
            }
          }
        }
      };
    },
    getAll(collection) {
      return {
        get: {
          action() {
            let entities;
            entities = collection.find().fetch();
            if (entities) {
              return {
                status: 'success',
                data: entities
              };
            } else {
              return {
                statusCode: 404,
                body: {
                  status: 'fail',
                  message: 'Unable to retrieve items from collection'
                }
              };
            }
          }
        }
      };
    }
  };


  /**
    A set of endpoints that can be applied to a Meteor.users Collection Route
   */

  Restfine.prototype._userCollectionEndpoints = {
    get(collection) {
      return {
        get: {
          action() {
            let entity;
            entity = collection.findOne(this.urlParams.id, {
              fields: {
                profile: 1
              }
            });
            if (entity) {
              return {
                status: 'success',
                data: entity
              };
            } else {
              return {
                statusCode: 404,
                body: {
                  status: 'fail',
                  message: 'User not found'
                }
              };
            }
          }
        }
      };
    },
    put(collection) {
      return {
        put: {
          action() {
            let entity;
            let entityIsUpdated;
            entityIsUpdated = collection.update(this.urlParams.id, {
              $set: {
                profile: this.bodyParams
              }
            });
            if (entityIsUpdated) {
              entity = collection.findOne(this.urlParams.id, {
                fields: {
                  profile: 1
                }
              });
              return {
                status: "success",
                data: entity
              };
            } else {
              return {
                statusCode: 404,
                body: {
                  status: 'fail',
                  message: 'User not found'
                }
              };
            }
          }
        }
      };
    },
    "delete"(collection) {
      return {
        "delete": {
          action() {
            if (collection.remove(this.urlParams.id)) {
              return {
                status: 'success',
                data: {
                  message: 'User removed'
                }
              };
            } else {
              return {
                statusCode: 404,
                body: {
                  status: 'fail',
                  message: 'User not found'
                }
              };
            }
          }
        }
      };
    },
    post(collection) {
      return {
        post: {
          action() {
            let entity;
            let entityId;
            entityId = Accounts.createUser(this.bodyParams);
            entity = collection.findOne(entityId, {
              fields: {
                profile: 1
              }
            });
            if (entity) {
              return {
                statusCode: 201,
                body: {
                  status: 'success',
                  data: entity
                }
              };
            } else {
              ({
                statusCode: 400
              });
              return {
                status: 'fail',
                message: 'No user added'
              };
            }
          }
        }
      };
    },
    getAll(collection) {
      return {
        get: {
          action() {
            let entities;
            entities = collection.find({}, {
              fields: {
                profile: 1
              }
            }).fetch();
            if (entities) {
              return {
                status: 'success',
                data: entities
              };
            } else {
              return {
                statusCode: 404,
                body: {
                  status: 'fail',
                  message: 'Unable to retrieve users'
                }
              };
            }
          }
        }
      };
    }
  };


  return Restfine;
}))();

exports.restfine = Restfine;
