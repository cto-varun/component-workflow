"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _xstate = require("xstate");
var _componentMessageBus = require("@ivoyant/component-message-bus");
var _jsonata = _interopRequireDefault(require("jsonata"));
var _WorkflowHelper = _interopRequireDefault(require("./WorkflowHelper"));
var _workflows = _interopRequireDefault(require("./workflows.json"));
var _actions = require("xstate/lib/actions");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const registrations = {};
const {
  workflows,
  templates
} = _workflows.default;

//  For now we will take the simple route
const getWorkflow = flowId => {
  const workflowTemplate = templates[workflows[flowId]];
  const workflow = JSON.parse(JSON.stringify(workflowTemplate));
  workflow.id = flowId;
  if (!workflow.context) {
    workflow.context = {};
  }
  if (!workflow.context.data) {
    workflow.context.data = {};
  }
  return workflow;
};
const jumpTo = (0, _xstate.send)((context, event) => {
  const {
    body = {}
  } = event;
  const {
    request
  } = body;
  const {
    conditionExpr,
    source = 'request'
  } = context.jumpTo[event.type];
  const step = (0, _jsonata.default)(conditionExpr).evaluate(source === 'request' ? request || body : context);
  return {
    type: step
  };
});
const WorkflowProvider = {
  init: () => {
    Object.keys(workflows).forEach(key => {
      _componentMessageBus.MessageBus.subscribe('WORKFLOWS'.concat('.').concat(key), 'WF.'.concat(key).concat('.*'), WorkflowProvider.eventListener);
    });
  },
  getService: function (registrationId, flowId) {
    let initialize = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
    let service = registrations[registrationId];
    const getServiceResp = {
      isNew: false
    };
    if (service === undefined && initialize) {
      getServiceResp.isNew = true;
      const workflowConfig = getWorkflow(flowId);
      workflowConfig.context.machine = {
        registrationId,
        flowId
      };
      const workflow = (0, _xstate.Machine)(workflowConfig, {
        services: _WorkflowHelper.default.getServices(workflowConfig),
        actions: {
          jumpTo,
          ..._WorkflowHelper.default.getActions(workflowConfig)
        }
      });
      service = (0, _xstate.interpret)(workflow).onTransition(state => {
        if (state.done) {
          //  MessageBus.unsubscribe(registrationId.concat(".").concat(".contextProvider"));
          delete registrations[registrationId];
        }
        _componentMessageBus.MessageBus.send('WF.'.concat(flowId).concat('.STATE.CHANGE'), state);
      });
      //  MessageBus.subscribe(
      //  registrationId.concat(".").concat(".contextProvider",
      //  "WF.".concat(flowId).concat(".STATE.REQUEST"),
      //  MachineProvider.stateProvider
      //  );
      registrations[registrationId] = service;
      _componentMessageBus.MessageBus.subscribe(flowId.concat('-contextProvider'), 'WF.'.concat(flowId).concat('.STATE.REQUEST'), WorkflowProvider.stateProvider);
      service.start();
    }
    getServiceResp.service = service;
    return getServiceResp;
  },
  eventListener: (subscriptionId, topic, data) => {
    if (topic.startsWith('WF.') && !topic.endsWith('.STATE.REQUEST') && !topic.endsWith('.STATE.CHANGE')) {
      const getServiceResp = WorkflowProvider.getService(data.header.registrationId, data.header.workflow, topic.endsWith('.INIT'));
      if (getServiceResp.service !== undefined) {
        if (topic.endsWith('.INIT') && getServiceResp.isNew || !topic.endsWith('.INIT')) {
          getServiceResp.service.send(data.header.eventType, data);
        }
      }
    }
  },
  stateProvider: (subscriptionId, topic, data) => {
    if (data.replySub) {
      const serviceResp = WorkflowProvider.getService(data.header.registrationId, data.header.workflow, false);
      let state;
      if (serviceResp && serviceResp.service?.machine?.context) {
        state = serviceResp.service.machine.context;
        if (data.body?.transform) {
          state = {
            data: (0, _jsonata.default)(data.body.transform).evaluate(state)
          };
        }
      }
      data.replySub.next({
        ...state?.data
      });
      data.replySub.complete();
    } else {
      console.log('request on ' + topic + ' does not have a reply subject');
    }
  }
};
Object.freeze(WorkflowProvider);
WorkflowProvider.init();
var _default = {
  WorkflowProvider
};
exports.default = _default;
module.exports = exports.default;