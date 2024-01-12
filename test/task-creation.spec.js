const Node = artifacts.require("Node");
const CrynuxToken = artifacts.require("CrynuxToken");
const Task = artifacts.require("Task");

const truffleAssert = require('truffle-assertions');

const { prepareNetwork } = require("./utils");

const { toWei, BN } = web3.utils;

contract("Task", (accounts) => {
    it("should create task after paying", async () => {
        const userAccount = accounts[1];
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        const taskType = 0;
        const taskHash = web3.utils.soliditySha3("task hash");
        const dataHash = web3.utils.soliditySha3("data hash");
        const vramLimit = 0;

        try {
            await taskInstance.createTask(taskType, taskHash, dataHash, vramLimit, {from: userAccount});
            assert.fail('should not pass');
        } catch (e) {
            assert.match(e.toString(), /Not enough tokens for task/, "Wrong reason: " + e.toString());
        }

        await cnxInstance.transfer(userAccount, new BN(toWei("600", "ether")));

        try {
            await taskInstance.createTask(taskType, taskHash, dataHash, vramLimit, {from: userAccount});
            assert.fail('should not pass');
        } catch (e) {
            assert.match(e.toString(), /Not enough allowance for task/, "Wrong reason: " + e.toString());
        }

        await cnxInstance.approve(taskInstance.address, new BN(toWei("600", "ether")), {from: userAccount});

        try {
            await taskInstance.createTask(taskType, taskHash, dataHash, vramLimit, {from: userAccount});
            assert.fail('should not pass');
        } catch (e) {
            assert.match(e.toString(), /No available nodes/, "Wrong reason: " + e.toString());
        }

        await prepareNetwork(accounts, cnxInstance, nodeInstance);

        const tx = await taskInstance.createTask(taskType, taskHash, dataHash, vramLimit, {from: userAccount});

        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[2] && ev.taskType == taskType;
        });
        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[3] && ev.taskType == taskType;
        });
        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[4] && ev.taskType == taskType;
        });

        const availableNodes = await nodeInstance.availableNodes();
        assert.equal(availableNodes.toNumber(), 0, "Wrong number of available nodes");

        await nodeInstance.quit({from: accounts[2]});

        // Should be in pending quit status now
        const nodeStatus = await nodeInstance.getNodeStatus(accounts[2]);
        assert.equal(nodeStatus.toNumber(), 4, "Wrong node status");

        try {
            await nodeInstance.quit({from: accounts[2]});
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Illegal node status/, "Wrong reason: " + e.toString());
        }

        await nodeInstance.pause({from: accounts[3]});

        // Should be in pending pause status now
        const node2Status = await nodeInstance.getNodeStatus(accounts[3]);
        assert.equal(node2Status.toNumber(), 3, "Wrong node status");

        try {
            await nodeInstance.pause({from: accounts[3]});
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Illegal node status/, "Wrong reason: " + e.toString());
        }
    });
});
