const Node = artifacts.require("Node");
const CrynuxToken = artifacts.require("CrynuxToken");
const Task = artifacts.require("Task");

const truffleAssert = require('truffle-assertions');

const { prepareNetwork } = require("./utils");
const {client} = require("truffle/build/3618.bundled");

const { toWei, BN } = web3.utils;

contract("Task", (accounts) => {
    it("should create task after paying", async () => {
        const userAccount = accounts[1];
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        const clientId = new BN(Math.round(Math.random() * 10000000));

        try {
            await taskInstance.createTask(clientId, web3.utils.soliditySha3("task hash"), web3.utils.soliditySha3("data hash"), {from: userAccount});
        } catch (e) {
            assert.match(e.toString(), /Not enough tokens for task/, "Wrong reason: " + e.toString());
        }

        await cnxInstance.transfer(userAccount, new BN(toWei("600", "ether")));

        try {
            await taskInstance.createTask(clientId, web3.utils.soliditySha3("task hash"), web3.utils.soliditySha3("data hash"), {from: userAccount});
        } catch (e) {
            assert.match(e.toString(), /Not enough allowance for task/, "Wrong reason: " + e.toString());
        }

        await cnxInstance.approve(taskInstance.address, new BN(toWei("600", "ether")), {from: userAccount});

        try {
            await taskInstance.createTask(clientId, web3.utils.soliditySha3("task hash"), web3.utils.soliditySha3("data hash"), {from: userAccount});
        } catch (e) {
            assert.match(e.toString(), /Not enough nodes/, "Wrong reason: " + e.toString());
        }

        await prepareNetwork(accounts, cnxInstance, nodeInstance);

        const tx = await taskInstance.createTask(
            clientId,
            web3.utils.soliditySha3("task hash"),
            web3.utils.soliditySha3("data hash"),
            {from: userAccount}
        );

        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[2] && clientId.eq(ev.clientId);
        });
        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[3] && clientId.eq(ev.clientId);
        });
        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[4] && clientId.eq(ev.clientId);
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
