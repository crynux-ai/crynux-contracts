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

        try {
            await taskInstance.createTask(web3.utils.soliditySha3("task hash"), web3.utils.soliditySha3("data hash"), {from: userAccount});
        } catch (e) {
            assert.match(e.toString(), /Not enough tokens for task/, "Wrong reason: " + e.toString());
        }

        await cnxInstance.transfer(userAccount, new BN(toWei("600", "ether")));

        try {
            await taskInstance.createTask(web3.utils.soliditySha3("task hash"), web3.utils.soliditySha3("data hash"), {from: userAccount});
        } catch (e) {
            assert.match(e.toString(), /Not enough allowance for task/, "Wrong reason: " + e.toString());
        }

        await cnxInstance.approve(taskInstance.address, new BN(toWei("600", "ether")), {from: userAccount});

        try {
            await taskInstance.createTask(web3.utils.soliditySha3("task hash"), web3.utils.soliditySha3("data hash"), {from: userAccount});
        } catch (e) {
            assert.match(e.toString(), /Not enough nodes/, "Wrong reason: " + e.toString());
        }

        await prepareNetwork(accounts, cnxInstance, nodeInstance);

        const tx = await taskInstance.createTask(
            web3.utils.soliditySha3("task hash"),
            web3.utils.soliditySha3("data hash"),
            {from: userAccount}
        );

        const taskId = tx.logs[0].args.taskId;

        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[2];
        });
        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[3];
        });
        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[4];
        });

        const availableNodes = await nodeInstance.availableNodes();
        assert.equal(availableNodes.toNumber(), 0, "Wrong number of available nodes");

        try {
            await nodeInstance.quit({from: accounts[2]});
        } catch (e) {
            assert.match(e.toString(), /Task not finished/, "Wrong reason: " + e.toString());
        }

        try {
            await nodeInstance.pause({from: accounts[2]});
        } catch (e) {
            assert.match(e.toString(), /Task not finished/, "Wrong reason: " + e.toString());
        }
    });
});
