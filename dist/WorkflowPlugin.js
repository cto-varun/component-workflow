"use strict";

var _jsPlugin = _interopRequireDefault(require("js-plugin"));
var _axios = _interopRequireDefault(require("axios"));
var _jsonata = _interopRequireDefault(require("jsonata"));
var _xstate = require("xstate");
var _componentMessageBus = require("@ivoyant/component-message-bus");
var _componentCache = require("@ivoyant/component-cache");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
var CryptoJS = require('crypto-js');
const mergeNodes = (target, source) => {
  Object.entries(source).forEach(sEntry => {
    if (sEntry.value instanceof Object && target[sEntry.key]) {
      if (sEntry.value instanceof Array) {
        target[sEntry.key] = sEntry.value;
      } else {
        mergeNodes(target[sEntry.key], sEntry.value);
      }
    } else {
      target[sEntry.key] = sEntry.value;
    }
  });
};
const transformEvent = (context, event, closure) => {
  const {
    op
  } = closure || {};
  const {
    mappings = {}
  } = context;
  let transformedData;
  if (op && mappings[closure.op]) {
    //  lets start with first array element - as we build more use cases, we will enhance this portion
    const mapping = context.mappings[closure.op][0];
    switch (mapping.source) {
      case 'context':
        transformedData = (0, _jsonata.default)(mapping.expr).evaluate(context);
        if (mapping?.responseMapping) {
          transformedData.body['responseMapping'] = mapping.responseMapping;
        }
        break;
      default:
    }
  }
  return transformedData;
};
const substituteWindowVariables = (headers, variablesToSubstitute) => {
  let headersCopy = {
    ...headers
  };
  let {
    attId,
    authBearer,
    token,
    mechId,
    profile
  } = window[sessionStorage.tabId].COM_IVOYANT_VARS;
  let cachedSessionInfo = _componentCache.cache.get('sessionInfo');
  if (authBearer !== false) {
    headersCopy = {
      ...headersCopy,
      Authorization: `Bearer ${token}`
    };
  }
  if (cachedSessionInfo?.authToken !== undefined) {
    // Set auth token here
    headersCopy = {
      ...headersCopy,
      'x-voyage-token': cachedSessionInfo.authToken
    };
  }

  // add user profile header
  if (headersCopy?.hasOwnProperty('x-user-profile')) {
    headersCopy = {
      ...headersCopy,
      'x-user-profile': profile
    };
  }
  if (headersCopy?.hasOwnProperty('x-client-mechid')) {
    headersCopy = {
      ...headersCopy,
      'x-client-mechid': mechId
    };
  }
  if (window[sessionStorage.tabId]?.conversationId) {
    headersCopy = {
      ...headersCopy,
      'X-ATT-ConversationId': window[sessionStorage.tabId].conversationId
    };
  }
  if (headersCopy?.hasOwnProperty('x-att-id')) {
    headersCopy = {
      ...headersCopy,
      'x-att-id': attId
    };
  }
  if (variablesToSubstitute) {
    Object.keys(variablesToSubstitute).forEach(variable => {
      if (headersCopy[variable] !== undefined) {
        let value;
        variablesToSubstitute[variable].split('.').forEach((v, i) => {
          value = i === 0 ? window[window.sessionStorage?.tabId][v] : (value || {})[v];
        });
        if (value) {
          headersCopy[variable] = value;
        }
      }
    });
  }
  return headersCopy;
};
const encryptPayload = (body, encryptionInfo) => {
  const {
    key
  } = encryptionInfo;
  const srcs = CryptoJS.enc.Utf8.parse(JSON.stringify(body));
  return CryptoJS.AES.encrypt(srcs, CryptoJS.enc.Base64.parse(key), {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7
  }).toString();
};
const decryptContent = (body, decryptionKey) => {
  let decrypt = CryptoJS.AES.decrypt(body, CryptoJS.enc.Base64.parse(decryptionKey), {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7
  }).toString(CryptoJS.enc.Utf8);
  return decrypt;
};
const processResponse = (responseMapping, request, response, decryption) => {
  const evaluationContext = {
    request,
    response
  };
  const message = {
    isError: false
  };
  if (responseMapping.success) {
    if (responseMapping.success.error && (0, _jsonata.default)(responseMapping.success.error.condition).evaluate(evaluationContext)) {
      message.isError = true;
      message.message = (0, _jsonata.default)(responseMapping.success.error.messageExpr).evaluate(evaluationContext);
    } else if (responseMapping.success.success) {
      message.message = (0, _jsonata.default)(responseMapping.success.success.messageExpr).evaluate(evaluationContext);
      if (response?.request?.responseText && decryption) {
        message.successData = decryptContent(response?.request?.responseText, decryption.key);
      } else {
        message.successData = response?.request?.responseText;
      }
    }
  }
  return message;
};
_jsPlugin.default.register({
  name: 'WorkflowPlugin',
  helpers: {
    merge(target, source) {
      mergeNodes(target, source);
    },
    init(context, event, data) {
      const {
        type
      } = context;
      mergeNodes(context, event);
      if (type === undefined) {
        delete context.type;
      } else {
        context.type = type;
      }
    },
    sendMessage(context, event, data) {
      _componentMessageBus.MessageBus.send(data.event, data.data);
    },
    sendWokflowMessage(context, event, data) {
      const {
        registrationId,
        flowId
      } = context.machine;
      const message = {
        header: {
          registrationId,
          workflow: flowId,
          eventType: data?.event
        },
        data
      };
      _componentMessageBus.MessageBus.send('WF.'.concat(flowId).concat('.').concat(data?.event), message);
    },
    store(context, event, _data) {
      const {
        body
      } = event;
      const {
        data
      } = context;
      let transformedData;
      if (_data?.transform) {
        transformedData = (0, _jsonata.default)(_data?.transform).evaluate(body);
      }
      data[_data?.key || event.type] = transformedData || {
        ...body
      };
      delete data[_data?.key || event.type].type;
    },
    cache(context, event, _data) {
      _componentCache.cache[_data.op](_data.key, _data?.expr ? (0, _jsonata.default)(_data.expr).evaluate(event) : event);
    },
    storeResp(context, event, _data) {
      const {
        data
      } = context;
      data[_data?.key || event.type] = {
        ...event.data.data
      };
    },
    append(context, event) {
      context.data[event.type] = {
        ...context.data[event.type],
        ...event
      };
      delete context.data[event.type].type;
    },
    log(context, event) {
      // console.log(context, event);
    },
    send(context, event) {
      const {
        body
      } = event;
      const {
        request
      } = body;
      const {
        jumpTo
      } = context;
      const {
        conditionExpr
      } = jumpTo[event.type];
      const step = (0, _jsonata.default)(conditionExpr).evaluate(request);
      return (0, _xstate.send)({
        type: step
      });
    },
    invokeService(context, event, closure) {
      const {
        body
      } = transformEvent(context, event, closure) || event;
      let {
        datasource
      } = body;
      const {
        datasources,
        datasourceExpr,
        request,
        requestMapping,
        responseMapping
      } = body;
      let {
        url,
        params
      } = datasource;
      const {
        method
      } = datasource;
      const {
        windowVariables,
        timeout,
        encryption,
        decryption
      } = datasource.config;
      let {
        headers
      } = datasource.config;
      let requestBody = request.body;
      let requestParams = request.params;

      //  dynamic datasource based on expression
      if (datasources && datasourceExpr) {
        datasource = datasources[(0, _jsonata.default)(datasourceExpr).evaluate(request)];
      }
      if (requestMapping) {
        const mappedData = (0, _jsonata.default)(requestMapping).evaluate(request);
        requestBody = mappedData.body || requestBody;
        requestParams = mappedData.params || requestParams;
      }
      if (requestParams) {
        if (params) {
          const filteredParams = {};
          Object.entries(requestParams).forEach(p => {
            if (params.includes(p[0])) {
              filteredParams[p[0]] = p[1];
            }
          });
          url = url.concat('?').concat(new URLSearchParams(filteredParams).toString());
        } else {
          Object.entries(requestParams).forEach(entry => {
            const [key, value] = entry;
            url = url.replace('{'.concat(key).concat('}'), value);
          });
        }
      }
      const instance = _axios.default.create();
      instance.defaults.timeout = timeout;
      if (encryption) {
        instance.interceptors.request.use(aRequest => {
          aRequest.data = encryptPayload(aRequest.data, encryption);
          return aRequest;
        });
      }
      if (responseMapping || decryption) {
        instance.interceptors.response.use(response => {
          if (decryption && response?.data) {
            try {
              response.data = decryptContent(response.data, decryption.key);
              response.data = JSON.parse(response.data);
            } catch (exception) {}
          }
          if (responseMapping && responseMapping.success) {
            const message = processResponse(responseMapping, request, response, decryption);
            response.data = message;
            if (message?.isError) {
              return Promise.reject(message);
            }
            return Promise.resolve(response);
          }
          return response;
        }, error => {
          if (decryption && error?.response?.data) {
            try {
              error.response.data = decryptContent(error.response.data, decryption.key);
              error.response.data = JSON.parse(error.response.data);
            } catch (exception) {}
          }
          if (responseMapping) {
            const message = {
              isError: true,
              message: 'Internal Server Error, Please try again later',
              erroCode: 500
            };
            if (error.response && responseMapping.error) {
              message.message = (0, _jsonata.default)(responseMapping.error.messageExpr).evaluate({
                request,
                error
              });
              message.errorCode = error.response?.status;
              message.response = error.response;
            }
            return Promise.reject(message);
          }
          return error;
        });
      }
      if (method === 'get' || method === 'delete') {
        let content = {
          headers: substituteWindowVariables(headers, windowVariables)
        };
        if (requestBody) {
          content.data = {
            ...requestBody
          };
        }
        closure.response = instance[method](url, content);
      } else {
        closure.response = instance[method](url, requestBody, {
          headers: substituteWindowVariables(headers, windowVariables)
        });
      }
    }
  }
});