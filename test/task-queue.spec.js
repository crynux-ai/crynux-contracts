const Node = artifacts.require("Node");
const CrynuxToken = artifacts.require("CrynuxToken");
const Task = artifacts.require("Task");
const TaskQueue = artifacts.require("TaskQueue");

const truffleAssert = require('truffle-assertions');

const { prepareNetwork, prepareNode, prepareTask, getCommitment } = require("./utils");

const { toWei, BN } = web3.utils;

contract("Task", async (accounts) => {
    it("push task to queue when there is no available nodes", async() => {
        const userAccount = accounts[1];
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();
        const taskQueueInstance = await TaskQueue.deployed();

        await cnxInstance.transfer(userAccount, new BN(toWei("600", "ether")));
        await cnxInstance.approve(taskInstance.address, new BN(toWei("600", "ether")), { from: userAccount });
    
        const taskType = 0;
        const taskHash = web3.utils.soliditySha3("task hash");
        const dataHash = web3.utils.soliditySha3("data hash");
        const taskFee = new BN(toWei("200", "ether"));
        const cap = 1;

        let tx = await taskInstance.createTask(taskType, taskHash, dataHash, 8, taskFee, cap,  { from: userAccount });
        truffleAssert.eventEmitted(tx, 'TaskPending', (ev) => {
            return ev.creator == userAccount;
        });

        let queueSize = await taskQueueInstance.size();
        assert.equal(queueSize, 1, "Wrong queue size")
    })
})

contract("Task", async (accounts) => {
    it("pop task from queue and execute it when nodes join", async() => {
        const userAccount = accounts[1];
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();
        const taskQueueInstance = await TaskQueue.deployed();

        await cnxInstance.transfer(userAccount, new BN(toWei("600", "ether")));
        await cnxInstance.approve(taskInstance.address, new BN(toWei("600", "ether")), { from: userAccount });
    
        const taskType = 0;
        const taskHash = web3.utils.soliditySha3("task hash");
        const dataHash = web3.utils.soliditySha3("data hash");
        const taskFee = new BN(toWei("30", "ether"));
        const cap = 1;

        let tx = await taskInstance.createTask(taskType, taskHash, dataHash, 8, taskFee, cap,  { from: userAccount });
        truffleAssert.eventEmitted(tx, 'TaskPending', (ev) => {
            return ev.creator == userAccount;
        });

        let taskId = tx.logs[0].args.taskId.toNumber();

        await prepareNetwork(
            accounts,
            cnxInstance,
            nodeInstance,
            ["NVIDIA GeForce GTX 1070", "NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti"],
            [8, 16, 16]
        );
        
        let queueSize = await taskQueueInstance.size();
        assert.equal(queueSize, 0, "Wrong queue size")
        
        for (let i = 0; i < 3; i++) {
            let nodeTaskId = (await taskInstance.getNodeTask(accounts[2 + i])).toNumber();
            assert.equal(taskId, nodeTaskId, "Wrong node task id")
        }
    })
})

contract("Task", async (accounts) => {
    it("pop task from queue and execute it when nodes finish last task", async() => {
        const userAccount = accounts[1];
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();
        const taskQueueInstance = await TaskQueue.deployed();

        await cnxInstance.transfer(userAccount, new BN(toWei("600", "ether")));
        await cnxInstance.approve(taskInstance.address, new BN(toWei("600", "ether")), { from: userAccount });
    
        const taskType = 0;
        const taskHash = web3.utils.soliditySha3("task hash");
        const dataHash = web3.utils.soliditySha3("data hash");
        const taskFee = new BN(toWei("30", "ether"));
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

        let nextTx = await taskInstance.createTask(taskType, taskHash, dataHash, 8, taskFee, cap,  { from: userAccount });

        let nextTaskId = nextTx.logs[0].args.taskId.toNumber();

        // cancel task
        for (let i = 1; i < 4; i++) {
            const nodeAddress = tx.logs[i].args.selectedNode;
            const round = tx.logs[i].args.round;
            await taskInstance.reportTaskError(taskId, round, { from: nodeAddress });
        }
        
        let queueSize = await taskQueueInstance.size();
        assert.equal(queueSize, 0, "Wrong queue size")
        
        for (let i = 0; i < 3; i++) {
            let nodeTaskId = (await taskInstance.getNodeTask(accounts[2 + i])).toNumber();
            assert.equal(nextTaskId, nodeTaskId, "Wrong node task id")
        }
    })
})

contract("Task", async (accounts) => {
    it("select correct task (sd)", async() => {
        const userAccount = accounts[1];
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();
        const taskQueueInstance = await TaskQueue.deployed();

        await cnxInstance.transfer(userAccount, new BN(toWei("600", "ether")));
        await cnxInstance.approve(taskInstance.address, new BN(toWei("600", "ether")), { from: userAccount });
    
        const taskHash = web3.utils.soliditySha3("task hash");
        const dataHash = web3.utils.soliditySha3("data hash");
        const taskFee = new BN(toWei("30", "ether"));
        const cap = 1;

        const taskIds = [];

        let tx = await taskInstance.createTask(0, taskHash, dataHash, 8, taskFee, cap,  { from: userAccount });
        truffleAssert.eventEmitted(tx, 'TaskPending', (ev) => {
            return ev.creator == userAccount;
        });
        taskIds.push(tx.logs[0].args.taskId.toNumber());

        tx = await taskInstance.createTask(1, taskHash, dataHash, 8, taskFee, cap,  { from: userAccount });
        truffleAssert.eventEmitted(tx, 'TaskPending', (ev) => {
            return ev.creator == userAccount;
        });
        taskIds.push(tx.logs[0].args.taskId.toNumber());

        tx = await taskInstance.createTask(0, taskHash, dataHash, 16, taskFee, cap,  { from: userAccount });
        truffleAssert.eventEmitted(tx, 'TaskPending', (ev) => {
            return ev.creator == userAccount;
        });
        taskIds.push(tx.logs[0].args.taskId.toNumber());

        await prepareNetwork(
            accounts,
            cnxInstance,
            nodeInstance,
            ["NVIDIA GeForce GTX 1070", "NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti"],
            [8, 16, 16]
        );
        
        let queueSize = await taskQueueInstance.size();
        assert.equal(queueSize, 2, "Wrong queue size")
        
        for (let i = 0; i < 3; i++) {
            let nodeTaskId = (await taskInstance.getNodeTask(accounts[2 + i])).toNumber();
            assert.equal(taskIds[0], nodeTaskId, "Wrong node task id")
        }
    })
})

contract("Task", async (accounts) => {
    it("select correct task (gpt)", async() => {
        const userAccount = accounts[1];
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();
        const taskQueueInstance = await TaskQueue.deployed();

        await cnxInstance.transfer(userAccount, new BN(toWei("600", "ether")));
        await cnxInstance.approve(taskInstance.address, new BN(toWei("600", "ether")), { from: userAccount });
    
        const taskHash = web3.utils.soliditySha3("task hash");
        const dataHash = web3.utils.soliditySha3("data hash");
        const taskFee = new BN(toWei("30", "ether"));
        const cap = 1;

        const taskIds = [];

        let tx = await taskInstance.createTask(0, taskHash, dataHash, 8, taskFee, cap,  { from: userAccount });
        truffleAssert.eventEmitted(tx, 'TaskPending', (ev) => {
            return ev.creator == userAccount;
        });
        taskIds.push(tx.logs[0].args.taskId.toNumber());

        tx = await taskInstance.createTask(1, taskHash, dataHash, 8, taskFee, cap,  { from: userAccount });
        truffleAssert.eventEmitted(tx, 'TaskPending', (ev) => {
            return ev.creator == userAccount;
        });
        taskIds.push(tx.logs[0].args.taskId.toNumber());

        tx = await taskInstance.createTask(0, taskHash, dataHash, 16, taskFee, cap,  { from: userAccount });
        truffleAssert.eventEmitted(tx, 'TaskPending', (ev) => {
            return ev.creator == userAccount;
        });
        taskIds.push(tx.logs[0].args.taskId.toNumber());

        await prepareNetwork(
            accounts,
            cnxInstance,
            nodeInstance,
            ["NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti"],
            [8, 8, 8]
        );
        
        let queueSize = await taskQueueInstance.size();
        assert.equal(queueSize, 2, "Wrong queue size")
        
        for (let i = 0; i < 3; i++) {
            let nodeTaskId = (await taskInstance.getNodeTask(accounts[2 + i])).toNumber();
            assert.equal(taskIds[1], nodeTaskId, "Wrong node task id")
        }
    })
})

contract("Task", async (accounts) => {
    it("select task with higher task fee", async() => {
        const userAccount = accounts[1];
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();
        const taskQueueInstance = await TaskQueue.deployed();

        await cnxInstance.transfer(userAccount, new BN(toWei("600", "ether")));
        await cnxInstance.approve(taskInstance.address, new BN(toWei("600", "ether")), { from: userAccount });
    
        const taskHash = web3.utils.soliditySha3("task hash");
        const dataHash = web3.utils.soliditySha3("data hash");

        const taskIds = [];

        let tx = await taskInstance.createTask(0, taskHash, dataHash, 8, new BN(toWei("30", "ether")), 1,  { from: userAccount });
        truffleAssert.eventEmitted(tx, 'TaskPending', (ev) => {
            return ev.creator == userAccount;
        });
        taskIds.push(tx.logs[0].args.taskId.toNumber());

        tx = await taskInstance.createTask(0, taskHash, dataHash, 8, new BN(toWei("60", "ether")), 2,  { from: userAccount });
        truffleAssert.eventEmitted(tx, 'TaskPending', (ev) => {
            return ev.creator == userAccount;
        });
        taskIds.push(tx.logs[0].args.taskId.toNumber());

        tx = await taskInstance.createTask(0, taskHash, dataHash, 8, new BN(toWei("35", "ether")), 1,  { from: userAccount });
        truffleAssert.eventEmitted(tx, 'TaskPending', (ev) => {
            return ev.creator == userAccount;
        });
        taskIds.push(tx.logs[0].args.taskId.toNumber());

        await prepareNetwork(
            accounts,
            cnxInstance,
            nodeInstance,
            ["NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti"],
            [8, 8, 8]
        );
        
        let queueSize = await taskQueueInstance.size();
        assert.equal(queueSize, 2, "Wrong queue size")
        
        for (let i = 0; i < 3; i++) {
            let nodeTaskId = (await taskInstance.getNodeTask(accounts[2 + i])).toNumber();
            assert.equal(taskIds[2], nodeTaskId, "Wrong node task id")
        }
    })
})

contract("Task", async (accounts) => {
    it("select task correctly when a node is slashed", async () => {
        const userAccount = accounts[1];
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();
        const taskQueueInstance = await TaskQueue.deployed();

        await cnxInstance.transfer(userAccount, new BN(toWei("600", "ether")));
        await cnxInstance.approve(taskInstance.address, new BN(toWei("600", "ether")), { from: userAccount });

        await prepareNetwork(
            accounts,
            cnxInstance,
            nodeInstance,
            ["NVIDIA GeForce GTX 1070", "NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti"],
            [8, 16, 16]
        );

        const taskHash = web3.utils.soliditySha3("task hash");
        const dataHash = web3.utils.soliditySha3("data hash");

        let tx = await taskInstance.createTask(0, taskHash, dataHash, 8, new BN(toWei("40", "ether")), 1,  { from: userAccount });
        let taskId = tx.logs[0].args.taskId;
        let nodeRounds = {};

        for (let i = 1; i < 4; i++) {
            const nodeAddress = tx.logs[i].args.selectedNode;
            nodeRounds[nodeAddress] = tx.logs[i].args.round;
        }
        
        await taskInstance.createTask(0, taskHash, dataHash, 8, new BN(toWei("40", "ether")), 1, {from: userAccount});

        const result = "0x0102030405060708";
        const errResult = "0x0101010101010101"
        // submit commitment
        for (let i = 0; i < 2; i++) {
            const [commitment, nonce] = getCommitment(result);
            await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[2 + i]],
                commitment,
                nonce,
                { from: accounts[2 + i] });
        }
        const [errCommitment, errNonce] = getCommitment(errResult);
        await taskInstance.submitTaskResultCommitment(
            taskId,
            nodeRounds[accounts[4]],
            errCommitment,
            errNonce,
            { from: accounts[4] },
        );

        // disclose task
        for (let i = 0; i < 2; i++) {
            await taskInstance.discloseTaskResult(
                taskId,
                nodeRounds[accounts[2 + i]],
                result,
                { from: accounts[2 + i] },
            );
        }
        await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[4]],
            errResult,
            { from: accounts[4] },
        );

        await taskInstance.reportResultsUploaded(
            taskId,
            nodeRounds[accounts[2]],
            { from: accounts[2] },
        );

        let status = await nodeInstance.getNodeStatus(accounts[4]);
        assert.equal(status.toNumber(), 0, "Wrong slashed node status");

        let queueSize = await taskQueueInstance.size();
        assert.equal(queueSize, 1, "Wrong queue size");

        await prepareNode(accounts[5], cnxInstance, nodeInstance, "NVIDIA GeForce GTX 1070", 8)

        queueSize = await taskQueueInstance.size();
        assert.equal(queueSize, 0, "Wrong queue size");

        let nodeTaskId = (await taskInstance.getNodeTask(accounts[2])).toNumber();
        assert.equal(nodeTaskId, 2, "Wrong node task id");
        nodeTaskId = (await taskInstance.getNodeTask(accounts[3])).toNumber();
        assert.equal(nodeTaskId, 2, "Wrong node task id");
        nodeTaskId = (await taskInstance.getNodeTask(accounts[5])).toNumber();
        assert.equal(nodeTaskId, 2, "Wrong node task id");
    })
})