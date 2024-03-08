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
        for (let i = 1; i < 4; i++) {
            const nodeAddress = tx.logs[i].args.selectedNode;
            const round = tx.logs[i].args.round;
            await taskInstance.reportTaskError(taskId, round, { from: nodeAddress });
        }

        tx = await taskInstance.createTask(taskType, taskHash, dataHash, 0, taskFee, cap, { from: userAccount });
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
        for (let i = 1; i < 4; i++) {
            const nodeAddress = tx.logs[i].args.selectedNode;
            const round = tx.logs[i].args.round;
            await taskInstance.reportTaskError(taskId, round, { from: nodeAddress });
        }

        tx = await taskInstance.createTask(taskType, taskHash, dataHash, 8, taskFee, cap, { from: userAccount });
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

contract("Task", async (accounts) => {
    it("should revert when nodes not enough and a task is running", async () => {
        const userAccount = accounts[1];
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();
    
        await cnxInstance.transfer(userAccount, new BN(toWei("600", "ether")));
        await cnxInstance.approve(taskInstance.address, new BN(toWei("600", "ether")), { from: userAccount });

        // join 4 nodes
        for (let i = 0; i < 4; i++) {
            await prepareNode(accounts[2+i], cnxInstance, nodeInstance, "NVIDIA GeForce GTX 1070", 8);
        }

        // start a task
        const taskType = 0;
        const taskHash = web3.utils.soliditySha3("task hash");
        const dataHash = web3.utils.soliditySha3("data hash");
        let tx = await taskInstance.createTask(taskType, taskHash, dataHash, 8, { from: userAccount });
        
        let taskId = tx.logs[0].args.taskId;
        let nodeRounds = {};
        let selectedNodes = [];

        for (let i = 0; i < 3; i++) {
            const nodeAddress = tx.logs[i].args.selectedNode;
            selectedNodes.push(nodeAddress);
            nodeRounds[nodeAddress] = tx.logs[i].args.round;
        }
        
        try {
            await taskInstance.createTask(0, taskHash, dataHash, 8, {from: userAccount});
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /No available node/, "Wrong reason: " + e.toString());
        }

        try {
            await taskInstance.createTask(1, taskHash, dataHash, 8, { from: userAccount });
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /No available node/, "Wrong reason: " + e.toString());
        }
        const result = "0x0102030405060708"

        // submit commitment
        for (let i = 0; i < 3; i++) {
            const nodeAddress = selectedNodes[i];
            const round = nodeRounds[nodeAddress];
            const [commitment, nonce] = getCommitment(result);
            await taskInstance.submitTaskResultCommitment(
                taskId,
                round,
                commitment,
                nonce,
                { from: nodeAddress }
            )

            try {
                await taskInstance.createTask(0, taskHash, dataHash, 8, {from: userAccount});
                assert.fail("should not pass");
            } catch (e) {
                assert.match(e.toString(), /No available node/, "Wrong reason: " + e.toString());
            }
    
            try {
                await taskInstance.createTask(1, taskHash, dataHash, 8, { from: userAccount });
                assert.fail("should not pass");
            } catch (e) {
                assert.match(e.toString(), /No available node/, "Wrong reason: " + e.toString());
            }    
        }

        // disclose task
        let resultNode = "";
        for (let i = 0; i < 3; i++) {
            const nodeAddress = selectedNodes[i];
            const round = nodeRounds[nodeAddress];
            
            let tx = await taskInstance.discloseTaskResult(taskId, round, result, { from: nodeAddress });
            if (i == 1){
                resultNode = tx.logs[0].args.resultNode;
            }
        }

        let availableNodes = await nodeInstance.availableNodes();
        assert.equal(availableNodes, 3, "wrong available nodes")

        // report result uploaded
        await taskInstance.reportResultsUploaded(taskId, nodeRounds[resultNode], { from: resultNode });

        availableNodes = await nodeInstance.availableNodes();
        assert.equal(availableNodes, 4, "wrong available nodes")

        for (let i = 0; i < 4; i++) {
            await nodeInstance.quit({ from: accounts[i + 2] });
        }
    })
})