const Node = artifacts.require("Node");
const CrynuxToken = artifacts.require("CrynuxToken");
const Task = artifacts.require("Task");
const NetworkStats = artifacts.require("NetworkStats");

const { toWei, BN } = web3.utils;
const { prepareTask, prepareNetwork, prepareUser, getCommitment, prepareNode } = require("./utils");

contract("Netstats", (accounts) => {
    it("test task count when task is executed immediately", async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();
        const netstatsInstance = await NetworkStats.deployed();

        await prepareNetwork(accounts, cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        let totalTasks = (await netstatsInstance.totalTasks()).toNumber();
        let runningTasks = (await netstatsInstance.runningTasks()).toNumber();
        let queuedTasks = (await netstatsInstance.queuedTasks()).toNumber();
        assert.equal(totalTasks, 1, "Wrong total tasks");
        assert.equal(runningTasks, 1, "Wrong running tasks");
        assert.equal(queuedTasks, 0, "Wrong queued tasks");

        const result = "0x0102030405060708";

        // submit commitment
        for (let i = 0; i < 3; i++) {
            const [commitment, nonce] = getCommitment(result);
            await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[2 + i]],
                commitment,
                nonce,
                { from: accounts[2 + i] });
        }

        // disclose task
        for (let i = 0; i < 3; i++) {
            await taskInstance.discloseTaskResult(
                taskId,
                nodeRounds[accounts[2 + i]],
                result,
                { from: accounts[2 + i] },
            );
        }

        await taskInstance.reportResultsUploaded(
            taskId,
            nodeRounds[accounts[2]],
            { from: accounts[2] },
        );

        totalTasks = (await netstatsInstance.totalTasks()).toNumber();
        runningTasks = (await netstatsInstance.runningTasks()).toNumber();
        queuedTasks = (await netstatsInstance.queuedTasks()).toNumber();
        assert.equal(totalTasks, 1, "Wrong total tasks");
        assert.equal(runningTasks, 0, "Wrong running tasks");
        assert.equal(queuedTasks, 0, "Wrong queued tasks");

    })
})

contract("Netstats", (accounts) => {
    it("test task count when there is task in queue", async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();
        const netstatsInstance = await NetworkStats.deployed();
        
        await prepareUser(accounts[1], cnxInstance, taskInstance);
        
        for (let i = 0; i < 3; i++) {
            await taskInstance.createTask(
                0,
                web3.utils.soliditySha3("task hash"),
                web3.utils.soliditySha3("data hash"),
                8,
                new BN(toWei("10", "ether")),
                1,
                {from: accounts[1]}
            );
        }
    
        let totalTasks = (await netstatsInstance.totalTasks()).toNumber();
        let runningTasks = (await netstatsInstance.runningTasks()).toNumber();
        let queuedTasks = (await netstatsInstance.queuedTasks()).toNumber();
        assert.equal(totalTasks, 3, "Wrong total tasks");
        assert.equal(runningTasks, 0, "Wrong running tasks");
        assert.equal(queuedTasks, 3, "Wrong queued tasks");

        // join nodes
        let blockNumber = 0;
        const gpuName = "NVIDIA GeForce GTX 1070 Ti";
        const gpuVram = 8;
        for (let i = 0; i < 3; i++) {
            const nodeAccount = accounts[2 + i];
            await cnxInstance.transfer(nodeAccount, new BN(toWei("400", "ether")));
            await cnxInstance.approve(nodeInstance.address, new BN(toWei("400", "ether")), {from: nodeAccount});
            await nodeInstance.join(gpuName, gpuVram, {from: nodeAccount});
        }

        const result = "0x0102030405060708";

        for (let i = 0; i < 3; i++) {
            totalTasks = (await netstatsInstance.totalTasks()).toNumber();
            runningTasks = (await netstatsInstance.runningTasks()).toNumber();
            queuedTasks = (await netstatsInstance.queuedTasks()).toNumber();
            assert.equal(totalTasks, 3, "Wrong total tasks");
            assert.equal(runningTasks, 1, "Wrong running tasks");
            assert.equal(queuedTasks, 2 - i, "Wrong queued tasks");

            let taskId;
            let nodeRounds = {};

            const events = await taskInstance.getPastEvents("TaskStarted", { fromBlock: blockNumber, toBlock: "latest" });

            for (const event of events) {
                taskId = event.args.taskId;
                const nodeAddress = event.args.selectedNode;
                nodeRounds[nodeAddress] = event.args.round;
                blockNumber = event.blockNumber;
            }

            // submit commitment
            for (let i = 0; i < 3; i++) {
                const [commitment, nonce] = getCommitment(result);
                await taskInstance.submitTaskResultCommitment(
                    taskId,
                    nodeRounds[accounts[2 + i]],
                    commitment,
                    nonce,
                    { from: accounts[2 + i] });
            }
    
            // disclose task
            for (let i = 0; i < 3; i++) {
                await taskInstance.discloseTaskResult(
                    taskId,
                    nodeRounds[accounts[2 + i]],
                    result,
                    { from: accounts[2 + i] },
                );
            }
    
            await taskInstance.reportResultsUploaded(
                taskId,
                nodeRounds[accounts[2]],
                { from: accounts[2] },
            );
            
        }
    })
})
