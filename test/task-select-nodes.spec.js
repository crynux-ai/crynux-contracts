const Node = artifacts.require("Node");
const CrynuxToken = artifacts.require("CrynuxToken");
const Task = artifacts.require("Task");

const truffleAssert = require('truffle-assertions');

const { prepareNetwork, prepareNode, getCommitment } = require("./utils");

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
        const taskFee = new BN(toWei("200", "ether"));
        const cap = 1;

        await prepareNetwork(
            accounts,
            cnxInstance,
            nodeInstance,
            ["NVIDIA GeForce GTX 1070", "NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti"],
            [8, 16, 16]
        );


        let tx = await taskInstance.createTask(taskType, taskHash, dataHash, 8, taskFee, cap,  { from: userAccount });
        truffleAssert.eventEmitted(tx, 'TaskStarted', (ev) => {
            return ev.selectedNode === accounts[2];
        });
        truffleAssert.eventEmitted(tx, 'TaskStarted', (ev) => {
            return ev.selectedNode === accounts[3];
        });
        truffleAssert.eventEmitted(tx, 'TaskStarted', (ev) => {
            return ev.selectedNode === accounts[4];
        });

        let taskId = tx.logs[0].args.taskId;
        // cancel task
        for (let i = 1; i < 4; i++) {
            const nodeAddress = tx.logs[i].args.selectedNode;
            const round = tx.logs[i].args.round;
            await taskInstance.reportTaskError(taskId, round, { from: nodeAddress });
        }

        tx = await taskInstance.createTask(taskType, taskHash, dataHash, 0, taskFee, cap, { from: userAccount });
        truffleAssert.eventEmitted(tx, 'TaskStarted', (ev) => {
            return ev.selectedNode === accounts[2];
        });
        truffleAssert.eventEmitted(tx, 'TaskStarted', (ev) => {
            return ev.selectedNode === accounts[3];
        });
        truffleAssert.eventEmitted(tx, 'TaskStarted', (ev) => {
            return ev.selectedNode === accounts[4];
        });

        taskId = tx.logs[0].args.taskId;
        // cancel task
        for (let i = 1; i < 4; i++) {
            const nodeAddress = tx.logs[i].args.selectedNode;
            const round = tx.logs[i].args.round;
            await taskInstance.reportTaskError(taskId, round, { from: nodeAddress });
        }

        for (let i = 0; i < 3; i++) {
            await nodeInstance.quit({ from: accounts[i + 2] });
        }
    })
})

contract("Task", async (accounts) => {
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
        const taskFee = new BN(toWei("200", "ether"));
        const cap = 1;

        await prepareNetwork(
            accounts,
            cnxInstance,
            nodeInstance,
            ["NVIDIA GeForce GTX 1070", "NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti"],
            [8, 16, 16]
        );

        await prepareNode(accounts[5], cnxInstance, nodeInstance, "NVIDIA GeForce RTX 4060 Ti", 16);

        let tx = await taskInstance.createTask(taskType, taskHash, dataHash, 8, taskFee, cap, { from: userAccount });
        truffleAssert.eventEmitted(tx, 'TaskStarted', (ev) => {
            return ev.selectedNode === accounts[3];
        });
        truffleAssert.eventEmitted(tx, 'TaskStarted', (ev) => {
            return ev.selectedNode === accounts[4];
        });
        truffleAssert.eventEmitted(tx, 'TaskStarted', (ev) => {
            return ev.selectedNode === accounts[5];
        });

        let taskId = tx.logs[0].args.taskId;
        // cancel task
        for (let i = 1; i < 4; i++) {
            const nodeAddress = tx.logs[i].args.selectedNode;
            const round = tx.logs[i].args.round;
            await taskInstance.reportTaskError(taskId, round, { from: nodeAddress });
        }

        tx = await taskInstance.createTask(taskType, taskHash, dataHash, 8, taskFee, cap, { from: userAccount });
        truffleAssert.eventEmitted(tx, 'TaskStarted', (ev) => {
            return ev.selectedNode === accounts[3];
        });
        truffleAssert.eventEmitted(tx, 'TaskStarted', (ev) => {
            return ev.selectedNode === accounts[4];
        });
        truffleAssert.eventEmitted(tx, 'TaskStarted', (ev) => {
            return ev.selectedNode === accounts[5];
        });

        taskId = tx.logs[0].args.taskId;
        // cancel task
        for (let i = 1; i < 4; i++) {
            const nodeAddress = tx.logs[i].args.selectedNode;
            const round = tx.logs[i].args.round;
            await taskInstance.reportTaskError(taskId, round, { from: nodeAddress });
        }

        for (let i = 0; i < 4; i++) {
            await nodeInstance.quit({ from: accounts[i + 2] });
        }
    })
})
