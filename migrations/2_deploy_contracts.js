const CrynuxToken = artifacts.require("CrynuxToken");
const Node = artifacts.require("Node");
const Task = artifacts.require("Task");
const QOS = artifacts.require("QOS");
const TaskQueue = artifacts.require("TaskQueue");

module.exports = async function (deployer) {
    await deployer.deploy(CrynuxToken);
    const crynuxTokenInstance = await CrynuxToken.deployed();

    await deployer.deploy(QOS);
    const qosInstance = await QOS.deployed();

    await deployer.deploy(TaskQueue);
    const taskQueueInstance = await TaskQueue.deployed();

    await deployer.deploy(Node, crynuxTokenInstance.address, qosInstance.address);
    const nodeInstance = await Node.deployed();

    await deployer.deploy(Task, nodeInstance.address, crynuxTokenInstance.address, qosInstance.address, taskQueueInstance.address);
    const taskInstance = await Task.deployed();

    await nodeInstance.updateTaskContractAddress(taskInstance.address);

    await qosInstance.updateNodeContractAddress(nodeInstance.address);
    await qosInstance.updateTaskContractAddress(taskInstance.address);

    await taskQueueInstance.updateTaskContractAddress(taskInstance.address);
};
