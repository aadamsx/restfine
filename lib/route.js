import ironRouterSendErrorToResponse from '.iron-router-error-to-response';

let Route = ((() => {
  class Route {
    constructor(api, path, options, endpoints1) {
      this.api = api;
      this.path = path;
      this.options = options;
      this.endpoints = endpoints1;
      if (!this.endpoints) {
        this.endpoints = this.options;
        this.options = {};
      }
    }

    /*
      Convert all endpoints on the given route into our expected endpoint object if it is a bare
      function

      @param {Route} route The route the endpoints belong to
     */

    _resolveEndpoints() {
      _.each(this.endpoints, (endpoint, method, endpoints) => {
        if (_.isFunction(endpoint)) {
          return endpoints[method] = {
            action: endpoint
          };
        }
      });
    }

    /*
      Configure the authentication and role requirement on all endpoints (except OPTIONS, which must
      be configured directly on the endpoint)

      Authentication can be required on an entire route or individual endpoints. If required on an
      entire route, that serves as the default. If required in any individual endpoints, that will
      override the default.

      After the endpoint is configured, all authentication and role requirements of an endpoint can be
      accessed at <code>endpoint.authRequired</code> and <code>endpoint.roleRequired</code>,
      respectively.

      @param {Route} route The route the endpoints belong to
      @param {Endpoint} endpoint The endpoint to configure
     */

    _configureEndpoints() {
      _.each(this.endpoints, function(endpoint, method) {
        let ref;
        let ref1;
        if (method !== 'options') {
          if (!((ref = this.options) != null ? ref.roleRequired : void 0)) {
            this.options.roleRequired = [];
          }
          if (!endpoint.roleRequired) {
            endpoint.roleRequired = [];
          }
          endpoint.roleRequired = _.union(endpoint.roleRequired, this.options.roleRequired);
          if (_.isEmpty(endpoint.roleRequired)) {
            endpoint.roleRequired = false;
          }
          if (endpoint.authRequired === void 0) {
            if (((ref1 = this.options) != null ? ref1.authRequired : void 0) || endpoint.roleRequired) {
              endpoint.authRequired = true;
            } else {
              endpoint.authRequired = false;
            }
          }
        }
      }, this);
    }

    /*
      Authenticate an endpoint if required, and return the result of calling it

      @returns The endpoint response or a 401 if authentication fails
     */

    _callEndpoint(endpointContext, endpoint) {
      let auth;
      auth = this._authAccepted(endpointContext, endpoint);
      if (auth.success) {
        if (this._roleAccepted(endpointContext, endpoint)) {
          return endpoint.action.call(endpointContext);
        } else {
          return {
            statusCode: 403,
            body: {
              status: 'error',
              message: 'You do not have permission to do this.'
            }
          };
        }
      } else {
        if (auth.data) {
          return auth.data;
        } else {
          return {
            statusCode: 401,
            body: {
              status: 'error',
              message: 'You must be logged in to do this.'
            }
          };
        }
      }
    }

    /*
      Authenticate the given endpoint if required

      Once it's globally configured in the API, authentication can be required on an entire route or
      individual endpoints. If required on an entire endpoint, that serves as the default. If required
      in any individual endpoints, that will override the default.

      @returns An object of the following format:

          {
            success: Boolean
            data: String or Object
          }

        where `success` is `true` if all required authentication checks pass and the optional `data`
        will contain the auth data when successful and an optional error response when auth fails.
     */

    _authAccepted(endpointContext, endpoint) {
      if (endpoint.authRequired) {
        return this._authenticate(endpointContext);
      } else {
        return {
          success: true
        };
      }
    }

    /*
      Verify the request is being made by an actively logged in user

      If verified, attach the authenticated user to the context.

      @returns An object of the following format:

          {
            success: Boolean
            data: String or Object
          }

        where `success` is `true` if all required authentication checks pass and the optional `data`
        will contain the auth data when successful and an optional error response when auth fails.
     */

    _authenticate(endpointContext) {
      let auth;
      let userSelector;
      auth = this.api._config.auth.user.call(endpointContext);
      if (!auth) {
        return {
          success: false
        };
      }
      if (auth.userId && auth.token && !auth.user) {
        userSelector = {};
        userSelector._id = auth.userId;
        userSelector[this.api._config.auth.token] = auth.token;
        auth.user = Meteor.users.findOne(userSelector);
      }
      if (auth.error) {
        return {
          success: false,
          data: auth.error
        };
      }
      if (auth.user) {
        endpointContext.user = auth.user;
        endpointContext.userId = auth.user._id;
        return {
          success: true,
          data: auth
        };
      } else {
        return {
          success: false
        };
      }
    }

    /*
      Authenticate the user role if required

      Must be called after _authAccepted().

      @returns True if the authenticated user belongs to <i>any</i> of the acceptable roles on the
               endpoint
     */

    _roleAccepted(endpointContext, endpoint) {
      if (endpoint.roleRequired) {
        if (_.isEmpty(_.intersection(endpoint.roleRequired, endpointContext.user.roles))) {
          return false;
        }
      }
      return true;
    }

    /*
      Respond to an HTTP request
     */

    _respond(response, body, statusCode, headers) {
      let defaultHeaders;
      let delayInMilliseconds;
      let minimumDelayInMilliseconds;
      let randomMultiplierBetweenOneAndTwo;
      let sendResponse;
      if (statusCode == null) {
        statusCode = 200;
      }
      if (headers == null) {
        headers = {};
      }
      defaultHeaders = this._lowerCaseKeys(this.api._config.defaultHeaders);
      headers = this._lowerCaseKeys(headers);
      headers = _.extend(defaultHeaders, headers);
      if (headers['content-type'].match(/json|javascript/) !== null) {
        if (this.api._config.prettyJson) {
          body = JSON.stringify(body, void 0, 2);
        } else {
          body = JSON.stringify(body);
        }
      }
      sendResponse = () => {
        response.writeHead(statusCode, headers);
        response.write(body);
        return response.end();
      };
      if (statusCode === 401 || statusCode === 403) {
        minimumDelayInMilliseconds = 500;
        randomMultiplierBetweenOneAndTwo = 1 + Math.random();
        delayInMilliseconds = minimumDelayInMilliseconds * randomMultiplierBetweenOneAndTwo;
        return Meteor.setTimeout(sendResponse, delayInMilliseconds);
      } else {
        return sendResponse();
      }
    }

    /*
      Return the object with all of the keys converted to lowercase
     */

    _lowerCaseKeys(object) {
      return _.chain(object).pairs().map(attr => [attr[0].toLowerCase(), attr[1]]).object().value();
    }
  }

  Route.prototype.addToApi = ((() => {
    let availableMethods;
    availableMethods = ['get', 'post', 'put', 'patch', 'delete', 'options'];
    return function() {
      let allowedMethods;
      let fullPath;
      let rejectedMethods;
      let self;
      self = this;
      if (_.contains(this.api._config.paths, this.path)) {
        throw new Error(`Cannot add a route at an existing path: ${this.path}`);
      }
      this.endpoints = _.extend({
        options: this.api._config.defaultOptionsEndpoint
      }, this.endpoints);
      this._resolveEndpoints();
      this._configureEndpoints();
      this.api._config.paths.push(this.path);
      allowedMethods = _.filter(availableMethods, method => _.contains(_.keys(self.endpoints), method));
      rejectedMethods = _.reject(availableMethods, method => _.contains(_.keys(self.endpoints), method));
      fullPath = this.api._config.apiPath + this.path;
      _.each(allowedMethods, method => {
        let endpoint;
        endpoint = self.endpoints[method];
        return JsonRoutes.add(method, fullPath, (req, res) => {
          let doneFunc;
          let endpointContext;
          let error;
          let responseData;
          let responseInitiated;
          responseInitiated = false;
          doneFunc = () => responseInitiated = true;
          endpointContext = {
            urlParams: req.params,
            queryParams: req.query,
            bodyParams: req.body,
            request: req,
            response: res,
            done: doneFunc
          };
          _.extend(endpointContext, endpoint);
          responseData = null;
          try {
            responseData = self._callEndpoint(endpointContext, endpoint);
          } catch (_error) {
            error = _error;
            ironRouterSendErrorToResponse(error, req, res);
            return;
          }
          if (responseInitiated) {
            res.end();
            return;
          } else {
            if (res.headersSent) {
              throw new Error(`Must call this.done() after handling endpoint response manually: ${method} ${fullPath}`);
            } else if (responseData === null || responseData === void 0) {
              throw new Error(`Cannot return null or undefined from an endpoint: ${method} ${fullPath}`);
            }
          }
          if (responseData.body && (responseData.statusCode || responseData.headers)) {
            return self._respond(res, responseData.body, responseData.statusCode, responseData.headers);
          } else {
            return self._respond(res, responseData);
          }
        });
      });
      return _.each(rejectedMethods, method => JsonRoutes.add(method, fullPath, (req, res) => {
        let headers;
        let responseData;
        responseData = {
          status: 'error',
          message: 'API endpoint does not exist'
        };
        headers = {
          'Allow': allowedMethods.join(', ').toUpperCase()
        };
        return self._respond(res, responseData, 405, headers);
      }));
    };
  }))();


  return Route;
}))();

export default Route;
