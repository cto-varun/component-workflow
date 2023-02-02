"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _WorkflowProvider = _interopRequireDefault(require("./WorkflowProvider"));
require("./WorkflowPlugin");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
var _default = {
  WorkflowProvider: _WorkflowProvider.default
};
exports.default = _default;
module.exports = exports.default;