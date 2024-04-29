const { assert, expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { Verifier } = require("./utils");
const { ethers } = require("hardhat");

describe("Netstats", () => {
    var v;
    beforeEach(async () => {
        v = new Verifier();
        await v.init();
    });

    it("test task count when task is executed immediately", async () => {
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const [taskId, nodeRounds, , ] = await v.prepareTask(v.user, v.accounts);
        let totalTasks = (await v.netstatsInstance.totalTasks());
        let runningTasks = (await v.netstatsInstance.runningTasks());
        let queuedTasks = (await v.netstatsInstance.queuedTasks());
        assert.equal(totalTasks, 1, "Wrong total tasks");
        assert.equal(runningTasks, 1, "Wrong running tasks");
        assert.equal(queuedTasks, 0, "Wrong queued tasks");

        const result = "0x0102030405060708";

        // submit commitment
        for (let i = 0; i < 3; i++) {
            const [commitment, nonce] = await v.getCommitment(result);
            await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce);
        }

        // disclose task
        for (let i = 0; i < 3; i++) {
            await v.taskInstance.connect(v.accounts[i]).discloseTaskResult(
                taskId,
                nodeRounds[v.accounts[i].address],
                result
            );
        }

        await v.taskInstance.connect(v.accounts[0]).reportResultsUploaded(
            taskId,
            nodeRounds[v.accounts[0].address]
        );

        totalTasks = await v.netstatsInstance.totalTasks();
        runningTasks = await v.netstatsInstance.runningTasks();
        queuedTasks = await v.netstatsInstance.queuedTasks();
        assert.equal(totalTasks, 1, "Wrong total tasks");
        assert.equal(runningTasks, 0, "Wrong running tasks");
        assert.equal(queuedTasks, 0, "Wrong queued tasks");

    })
})

describe("Netstats", () => {
    var v;
    beforeEach(async () => {
        v = new Verifier();
        await v.init();
    });

    it("test task count when there is task in queue", async () => {

        await v.prepareUser(v.user);

        for (let i = 0; i < 3; i++) {
            await v.taskInstance.connect(v.user).createTask(
                0,
                ethers.solidityPackedKeccak256(["string"], ["task hash"]),
                ethers.solidityPackedKeccak256(["string"], ["data hash"]),
                8,
                1,
                {value: ethers.parseUnits("10", "ether")},
            );
        }

        let totalTasks = await v.netstatsInstance.totalTasks();
        let runningTasks = await v.netstatsInstance.runningTasks();
        let queuedTasks = await v.netstatsInstance.queuedTasks();
        assert.equal(totalTasks, 3, "Wrong total tasks");
        assert.equal(runningTasks, 0, "Wrong running tasks");
        assert.equal(queuedTasks, 3, "Wrong queued tasks");

        // join nodes
        let blockNumber = 0;
        const gpuName = "NVIDIA GeForce GTX 1070 Ti";
        const gpuVram = 8;
        for (let i = 0; i < 3; i++) {
            const nodeAccount = v.accounts[i];
            await helpers.setBalance(nodeAccount.address, ethers.parseEther("500"));
            await v.nodeInstance.connect(nodeAccount).join(gpuName, gpuVram, {value: ethers.parseEther("400")});
        }

        const result = "0x0102030405060708";

        for (let i = 0; i < 3; i++) {
            totalTasks = await v.netstatsInstance.totalTasks();
            runningTasks = await v.netstatsInstance.runningTasks();
            queuedTasks = await v.netstatsInstance.queuedTasks();
            assert.equal(totalTasks, 3, "Wrong total tasks");
            assert.equal(runningTasks, 1, "Wrong running tasks");
            assert.equal(queuedTasks, 2 - i, "Wrong queued tasks");

            let taskId;
            let nodeRounds = {};
            const events = await v.taskInstance.queryFilter("TaskStarted", blockNumber, "latest");

            for (const event of events) {
                taskId = event.args.taskId;
                const nodeAddress = event.args.selectedNode;
                nodeRounds[nodeAddress] = event.args.round;
                blockNumber = event.blockNumber;
            }

            // submit commitment
            for (let i = 0; i < 3; i++) {
                const [commitment, nonce] = await v.getCommitment(result);
                await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                    taskId,
                    nodeRounds[v.accounts[i].address],
                    commitment,
                    nonce)
            }

            // disclose task
            for (let i = 0; i < 3; i++) {
                await v.taskInstance.connect(v.accounts[i]).discloseTaskResult(
                    taskId,
                    nodeRounds[v.accounts[i].address],
                    result,
                );
            }

            await v.taskInstance.connect(v.accounts[0]).reportResultsUploaded(
                taskId,
                nodeRounds[v.accounts[0].address],
            );

        }
    })
})
