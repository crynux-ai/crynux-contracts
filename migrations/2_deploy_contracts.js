const CrynuxToken = artifacts.require("CrynuxToken");
const Node = artifacts.require("Node");
const Task = artifacts.require("Task");

module.exports = async function (deployer) {

    await deployer.deploy(CrynuxToken);
    const crynuxTokenInstance = await CrynuxToken.deployed();

    await deployer.deploy(Node, crynuxTokenInstance.address);
    const nodeInstance = await Node.deployed();

    await deployer.deploy(Task, nodeInstance.address, crynuxTokenInstance.address);
    const taskInstance = await Task.deployed();

    await nodeInstance.updateTaskContractAddress(taskInstance.address);
};
