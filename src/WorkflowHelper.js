import plugin from 'js-plugin';

class WorkflowHelper {
    constructor() {
        this.actions = {};
        this.services = {};
        this.services['helpers-invokeService'] = (context, event, { src }) => {
            const closure = { ...src };
            plugin.invoke('helpers.invokeService', context, event, closure);
            return closure.response;
        };
    }

    getActions(machineConfig) {
        let actionsForMachine = this.actions[machineConfig.id];

        if (!actionsForMachine) {
            const actionTypes = [];
            Object.keys(machineConfig.states).forEach((stateKey) => {
                const state = machineConfig.states[stateKey];
                (state.entry || []).forEach((action) => {
                    const actionType =
                        action instanceof Object ? action.type : action;

                    if (!actionTypes.includes(actionType)) {
                        actionTypes.push(actionType);
                    }
                });
                (state.exit || []).forEach((action) => {
                    const actionType =
                        action instanceof Object ? action.type : action;
                    if (!actionTypes.includes(actionType)) {
                        actionTypes.push(actionType);
                    }
                });

                if (state.on !== undefined) {
                    Object.keys(state.on).forEach((event) => {
                        (state.on[event].actions || []).forEach((action) => {
                            const actionType =
                                action instanceof Object ? action.type : action;
                            if (!actionTypes.includes(actionType)) {
                                actionTypes.push(actionType);
                            }
                        });
                    });
                }

                if (state.invoke !== undefined) {
                    if (state.invoke.onDone.actions)
                        state.invoke.onDone.actions.forEach((action) => {
                            const actionType =
                                action instanceof Object ? action.type : action;
                            if (!actionTypes.includes(actionType)) {
                                actionTypes.push(actionType);
                            }
                        });
                }
            });

            actionsForMachine = {};

            //  Collect Action Function
            actionTypes.forEach((actionType) => {
                if (actionType.includes('-')) {
                    actionsForMachine[actionType] = (
                        context,
                        event,
                        { action }
                    ) => {
                        plugin.invoke(
                            actionType.replace('-', '.'),
                            context,
                            event,
                            action?.data
                        );
                    };
                } 
            });

            this.actions[machineConfig.id] = actionsForMachine;
        }
        // eslint-disable-next-line no-param-reassign
        return actionsForMachine;
    }

    getServices(machineConfig) {
        return this.services;
    }
}

const workflowHelper = new WorkflowHelper();
Object.freeze(workflowHelper);

export default workflowHelper;
