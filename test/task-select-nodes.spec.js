const Node = artifacts.require("Node");
const CrynuxToken = artifacts.require("CrynuxToken");
const Task = artifacts.require("Task");

const truffleAssert = require('truffle-assertions');

const { prepareNetwork, prepareNode } = require("./utils");

const { toWei, BN } = web3.utils;


contract("Task", async (accounts) => {
    it("should select nodes correctly for SD type task", async () => {
        const userAccount = accounts[1];
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();
    
        await cnxInstance.transfer(userAccount, new BN(toWei("600", "ether")));
        await cnxInstance.approve(taskInstance.address, new BN(toWei("600", "ether")), { from: userAccount });
    
        const taskType = 0;
        const taskHash = web3.utils.soliditySha3("task hash");
        const dataHash = web3.utils.soliditySha3("data hash");

        try {
            await taskInstance.createTask(taskType, taskHash, dataHash, 0, { from: userAccount });
            assert.fail("should not pass")
        } catch (e) {
            assert.match(e.toString(), /No available nodes/, "Wrong reason: " + e.toString());
        }

        await prepareNetwork(
            accounts,
            cnxInstance,
            nodeInstance,
            ["NVIDIA GeForce GTX 1070", "NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti"],
            [8, 16, 16]
        );

        try {
            await taskInstance.createTask(taskType, taskHash, dataHash, 16, { from: userAccount });
            assert.fail("should not pass")
        } catch (e) {
            assert.match(e.toString(), /No kind of gpu vram meets condition/, "Wrong reason: " + e.toString());
        }

        let tx = await taskInstance.createTask(taskType, taskHash, dataHash, 8, { from: userAccount });
        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[2];
        });
        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[3];
        });
        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[4];
        });

        let taskId = tx.logs[0].args.taskId;
        // cancel task
        for (let i = 0; i < 3; i++) {
            const nodeAddress = tx.logs[i].args.selectedNode;
            const round = tx.logs[i].args.round;
            await taskInstance.reportTaskError(taskId, round, { from: nodeAddress });
        }

        tx = await taskInstance.createTask(taskType, taskHash, dataHash, 0, { from: userAccount });
        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[2];
        });
        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[3];
        });
        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[4];
        });

        taskId = tx.logs[0].args.taskId;
        // cancel task
        for (let i = 0; i < 3; i++) {
            const nodeAddress = tx.logs[i].args.selectedNode;
            const round = tx.logs[i].args.round;
            await taskInstance.reportTaskError(taskId, round, { from: nodeAddress });
        }

        for (let i = 0; i < 3; i++) {
            await nodeInstance.quit({ from: accounts[i + 2] });
        }
    })

    it("should select nodes correctly for LLM type task", async () => {
        const userAccount = accounts[1];
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await cnxInstance.transfer(userAccount, new BN(toWei("600", "ether")));
        await cnxInstance.approve(taskInstance.address, new BN(toWei("600", "ether")), { from: userAccount });
    
        const taskType = 1;
        const taskHash = web3.utils.soliditySha3("task hash");
        const dataHash = web3.utils.soliditySha3("data hash");

        try {
            await taskInstance.createTask(taskType, taskHash, dataHash, 0, { from: userAccount });
            assert.fail("should not pass")
        } catch (e) {
            assert.match(e.toString(), /No kind of gpu id meets condition/, "Wrong reason: " + e.toString());
        }

        await prepareNetwork(
            accounts,
            cnxInstance,
            nodeInstance,
            ["NVIDIA GeForce GTX 1070", "NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti"],
            [8, 16, 16]
        );

        try {
            await taskInstance.createTask(taskType, taskHash, dataHash, 8, { from: userAccount });
            assert.fail("should not pass")
        } catch (e) {
            assert.match(e.toString(), /No kind of gpu id meets condition/, "Wrong reason: " + e.toString());
        }

        try {
            await taskInstance.createTask(taskType, taskHash, dataHash, 16, { from: userAccount });
            assert.fail("should not pass")
        } catch (e) {
            assert.match(e.toString(), /No kind of gpu id meets condition/, "Wrong reason: " + e.toString());
        }

        await prepareNode(accounts[5], cnxInstance, nodeInstance, "NVIDIA GeForce RTX 4060 Ti", 16);

        let tx = await taskInstance.createTask(taskType, taskHash, dataHash, 8, { from: userAccount });
        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[3];
        });
        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[4];
        });
        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[5];
        });


        let taskId = tx.logs[0].args.taskId;
        // cancel task
        for (let i = 0; i < 3; i++) {
            const nodeAddress = tx.logs[i].args.selectedNode;
            const round = tx.logs[i].args.round;
            await taskInstance.reportTaskError(taskId, round, { from: nodeAddress });
        }

        tx = await taskInstance.createTask(taskType, taskHash, dataHash, 8, { from: userAccount });
        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[3];
        });
        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[4];
        });
        truffleAssert.eventEmitted(tx, 'TaskCreated', (ev) => {
            return ev.selectedNode === accounts[5];
        });

        taskId = tx.logs[0].args.taskId;
        // cancel task
        for (let i = 0; i < 3; i++) {
            const nodeAddress = tx.logs[i].args.selectedNode;
            const round = tx.logs[i].args.round;
            await taskInstance.reportTaskError(taskId, round, { from: nodeAddress });
        }

        for (let i = 0; i < 3; i++) {
            await nodeInstance.quit({ from: accounts[i + 2] });
        }
    })
})