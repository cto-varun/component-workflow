import { Machine, interpret, send  } from 'xstate';

import { MessageBus } from '@ivoyant/component-message-bus';
import jsonata from 'jsonata';

import stateMachineHelper from './WorkflowHelper';
import workflowConfig from './workflows.json';
import { raise } from 'xstate/lib/actions';

const registrations = {};
const { workflows, templates } = workflowConfig;

//  For now we will take the simple route
const getWorkflow = (flowId) => {
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

const jumpTo = send((context, event) => {
    const { body = {}} = event;
    const { request } = body;
    const { conditionExpr, source = 'request' } = context.jumpTo[event.type];
    const step = jsonata(conditionExpr).evaluate(
        source === 'request' ? (request || body) : context
    );
    return { type: step };
});


const WorkflowProvider = {
    init: () => {
        Object.keys(workflows).forEach((key) => {
            MessageBus.subscribe(
                'WORKFLOWS'.concat('.').concat(key),
                'WF.'.concat(key).concat('.*'),
                WorkflowProvider.eventListener
            );
        });
    },
    getService: (registrationId, flowId, initialize = false) => {
        let service = registrations[registrationId];
        const getServiceResp = { isNew: false };
        if (service === undefined && initialize) {
            getServiceResp.isNew = true;
            const workflowConfig = getWorkflow(flowId);
            workflowConfig.context.machine = {
                registrationId,
                flowId
            }
            const workflow = Machine(workflowConfig, {
                services: stateMachineHelper.getServices(workflowConfig),
                actions: {
                    jumpTo,
                    ...stateMachineHelper.getActions(workflowConfig),
                },
            });

            service = interpret(workflow).onTransition((state) => {
                if (state.done) {
                    //  MessageBus.unsubscribe(registrationId.concat(".").concat(".contextProvider"));
                    delete registrations[registrationId];
                }
                MessageBus.send(
                    'WF.'.concat(flowId).concat('.STATE.CHANGE'),
                    state
                );
            });
            //  MessageBus.subscribe(
            //  registrationId.concat(".").concat(".contextProvider",
            //  "WF.".concat(flowId).concat(".STATE.REQUEST"),
            //  MachineProvider.stateProvider
            //  );
            registrations[registrationId] = service;
            MessageBus.subscribe(
                flowId.concat('-contextProvider'),
                'WF.'.concat(flowId).concat('.STATE.REQUEST'),
                WorkflowProvider.stateProvider
            );
            service.start();
        }
        getServiceResp.service = service;

        return getServiceResp;
    },
    eventListener: (subscriptionId, topic, data) => {
        if (
            topic.startsWith('WF.') &&
            !topic.endsWith('.STATE.REQUEST') &&
            !topic.endsWith('.STATE.CHANGE')
        ) {
            const getServiceResp = WorkflowProvider.getService(
                data.header.registrationId,
                data.header.workflow,
                topic.endsWith('.INIT')
            );
            if (getServiceResp.service !== undefined) {
                if (
                    (topic.endsWith('.INIT') && getServiceResp.isNew) ||
                    !topic.endsWith('.INIT')
                ) {
                    getServiceResp.service.send(data.header.eventType, data);
                }
            }
        }
    },
    stateProvider: (subscriptionId, topic, data) => {
        if (data.replySub) {
            const serviceResp = WorkflowProvider.getService(
                data.header.registrationId,
                data.header.workflow,
                false
            );
            let state;
            if (serviceResp && serviceResp.service?.machine?.context) {
                state = serviceResp.service.machine.context;
                if (data.body?.transform) {
                    state = {data: jsonata(data.body.transform).evaluate(state)};
                }
            }
            data.replySub.next({ ...state?.data });
            data.replySub.complete();
        } else {
            console.log(
                'request on ' + topic + ' does not have a reply subject'
            );
        }
    },
};

Object.freeze(WorkflowProvider);
WorkflowProvider.init();
export default { WorkflowProvider };
