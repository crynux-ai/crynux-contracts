const CrynuxToken = artifacts.require("CrynuxToken");
const Node = artifacts.require("Node");
const Task = artifacts.require("Task");
const Random = artifacts.require("Random");
const Hamming = artifacts.require("Hamming");

module.exports = async function (deployer) {
    await deployer.deploy(Random);
    await Random.deployed();
    await deployer.deploy(Hamming);
    await Hamming.deployed();

    await deployer.link(Random, Task);
    await deployer.link(Hamming, Task);

    await deployer.deploy(CrynuxToken);
    const crynuxTokenInstance = await CrynuxToken.deployed();

    await deployer.deploy(Node, crynuxTokenInstance.address);
    const nodeInstance = await Node.deployed();

    await deployer.deploy(Task, nodeInstance.address, crynuxTokenInstance.address);
    const taskInstance = await Task.deployed();

    await nodeInstance.updateTaskContractAddress(taskInstance.address);
};
