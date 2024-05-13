const { assert, expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { Verifier } = require("./utils");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { ethers } = require("hardhat");

describe("Task", async () => {
    it("push task to queue when there is no available nodes", async() => {
        let v = new Verifier();
        await v.init();

        await helpers.setBalance(v.user.address, ethers.parseEther("600"));

        const taskType = 0;
        const taskHash = ethers.solidityPackedKeccak256(["string"], ["task hash"]);
        const dataHash = ethers.solidityPackedKeccak256(["string"], ["data hash"]);
        const taskFee = ethers.parseUnits("200", "ether");
        const cap = 1;

        let contract = v.taskInstance.connect(v.user);
        let tx = await contract.createTask(
            taskType, taskHash, dataHash, 8, cap, {value: taskFee});
        await expect(tx).emit(contract, "TaskPending").withArgs(
            anyValue, anyValue, v.user.address, anyValue, anyValue);

        let queueSize = await v.taskQueueInstance.size();
        assert.equal(queueSize, 1, "Wrong queue size")
    })
})

describe("Task", async () => {
    it("pop task from queue and execute it when nodes join", async() => {
        let v = new Verifier();
        await v.init();

        await helpers.setBalance(v.user.address, ethers.parseEther("600"));

        const taskType = 0;
        const taskHash = ethers.solidityPackedKeccak256(["string"], ["task hash"]);
        const dataHash = ethers.solidityPackedKeccak256(["string"], ["data hash"]);
        const taskFee = ethers.parseUnits("30", "ether");
        const cap = 1;

        let contract = v.taskInstance.connect(v.user);
        let tx = await contract.createTask(
            taskType, taskHash, dataHash, 8, cap, {value: taskFee});
        await expect(tx).emit(contract, "TaskPending").withArgs(
            anyValue, anyValue, v.user.address, anyValue, anyValue);

        tx = await (await tx).wait()
        let logs = tx.logs.filter((x) => x.constructor.name == "EventLog");
        let taskId = logs[0].args.taskId;

        await v.prepareNetwork(
            ["NVIDIA GeForce GTX 1070", "NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti"],
            [8, 16, 16]
        );

        let queueSize = await v.taskQueueInstance.size();
        assert.equal(queueSize, 0, "Wrong queue size")

        for (let i = 0; i < 3; i++) {
            let nodeTaskId = await v.taskInstance.getNodeTask(v.accounts[i]);
            assert.equal(taskId, nodeTaskId, "Wrong node task id")
        }
    })
})

describe("Task", async () => {
    it("pop task from queue and execute it when nodes finish last task", async() => {
        let v = new Verifier();
        await v.init();

        await helpers.setBalance(v.user.address, ethers.parseEther("600"));

        const taskType = 0;
        const taskHash = ethers.solidityPackedKeccak256(["string"], ["task hash"]);
        const dataHash = ethers.solidityPackedKeccak256(["string"], ["data hash"]);
        const taskFee = ethers.parseUnits("30", "ether");
        const cap = 1;

        await v.prepareNetwork(
            ["NVIDIA GeForce GTX 1070", "NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti"],
            [8, 16, 16]
        );

        let contract = v.taskInstance.connect(v.user);
        let tx = await contract.createTask(
            taskType, taskHash, dataHash, 8, cap, {value: taskFee});
        await expect(tx).emit(contract, "TaskStarted").withArgs(
            anyValue, anyValue, anyValue, v.accounts[0].address, anyValue, anyValue, anyValue);
        await expect(tx).emit(contract, "TaskStarted").withArgs(
            anyValue, anyValue, anyValue, v.accounts[1].address, anyValue, anyValue, anyValue);
        await expect(tx).emit(contract, "TaskStarted").withArgs(
            anyValue, anyValue, anyValue, v.accounts[2].address, anyValue, anyValue, anyValue);

        tx = await tx.wait()
        let logs = tx.logs.filter((x) => x.constructor.name == "EventLog");
        let taskId = logs[0].args.taskId;

        let nextTx = await v.taskInstance.connect(v.user).createTask(
            taskType, taskHash, dataHash, 8, cap, {value: taskFee});

        nextlogs = (await nextTx.wait()).logs.filter((x) => x.constructor.name == "EventLog");
        let nextTaskId = nextlogs[0].args.taskId;

        // cancel task
        for (let i = 1; i < 4; i++) {
            const nodeAddress = logs[i].args.selectedNode;
            const round = logs[i].args.round;
            const noder = v.accounts.filter(x=>x.address==nodeAddress);
            await v.taskInstance.connect(noder[0]).reportTaskError(taskId, round);
        }

        let queueSize = await v.taskQueueInstance.size();
        assert.equal(queueSize, 0, "Wrong queue size")

        for (let i = 0; i < 3; i++) {
            let nodeTaskId = await v.taskInstance.getNodeTask(v.accounts[i]);
            assert.equal(nextTaskId, nodeTaskId, "Wrong node task id")
        }
    })
})

describe("Task", async () => {
    it("select correct task (sd)", async() => {
        let v = new Verifier();
        await v.init();

        await helpers.setBalance(v.user.address, ethers.parseEther("600"));

        const taskHash = ethers.solidityPackedKeccak256(["string"], ["task hash"]);
        const dataHash = ethers.solidityPackedKeccak256(["string"], ["data hash"]);
        const taskFee = ethers.parseUnits("30", "ether");
        const cap = 1;

        const taskIds = [];

        let contract = v.taskInstance.connect(v.user);
        let tx = await contract.createTask(0, taskHash, dataHash, 8, cap, {value: taskFee});
        await expect(tx).emit(contract, "TaskPending").withArgs(
            anyValue, anyValue, v.user.address, anyValue, anyValue);
        tx = await tx.wait()
        let logs = tx.logs.filter((x) => x.constructor.name == "EventLog");
        taskIds.push(logs[0].args.taskId);

        tx = await contract.createTask(1, taskHash, dataHash, 8, cap, {value: taskFee});
        await expect(tx).emit(contract, "TaskPending").withArgs(
            anyValue, anyValue, v.user.address, anyValue, anyValue);
        tx = await tx.wait()
        logs = tx.logs.filter((x) => x.constructor.name == "EventLog");
        taskIds.push(logs[0].args.taskId);

        tx = await contract.createTask(0, taskHash, dataHash, 16, cap, {value: taskFee});
        await expect(tx).emit(contract, "TaskPending").withArgs(
            anyValue, anyValue, v.user.address, anyValue, anyValue);
        tx = await tx.wait()
        logs = tx.logs.filter((x) => x.constructor.name == "EventLog");
        taskIds.push(logs[0].args.taskId);

        await v.prepareNetwork(
            ["NVIDIA GeForce GTX 1070", "NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti"],
            [8, 16, 16]
        );

        let queueSize = await v.taskQueueInstance.size();
        assert.equal(queueSize, 2, "Wrong queue size")

        for (let i = 0; i < 3; i++) {
            let nodeTaskId = await v.taskInstance.getNodeTask(v.accounts[i]);
            assert.equal(taskIds[0], nodeTaskId, "Wrong node task id")
        }
    })
})

describe("Task", async () => {
    it("select correct task (gpt)", async() => {
        let v = new Verifier();
        await v.init();

        await helpers.setBalance(v.user.address, ethers.parseEther("600"));

        const taskHash = ethers.solidityPackedKeccak256(["string"], ["task hash"]);
        const dataHash = ethers.solidityPackedKeccak256(["string"], ["data hash"]);
        const taskFee = ethers.parseUnits("30", "ether");
        const cap = 1;

        const taskIds = [];

        let contract = v.taskInstance.connect(v.user);
        tx = await contract.createTask(0, taskHash, dataHash, 8, cap, {value: taskFee});
        await expect(tx).emit(contract, "TaskPending").withArgs(
            anyValue, anyValue, v.user.address, anyValue, anyValue);
        tx = await tx.wait()
        let logs = tx.logs.filter((x) => x.constructor.name == "EventLog");
        taskIds.push(logs[0].args.taskId);

        tx = await contract.createTask(1, taskHash, dataHash, 8, cap, {value: taskFee});
        await expect(tx).emit(contract, "TaskPending").withArgs(
            anyValue, anyValue, v.user.address, anyValue, anyValue);
        tx = await tx.wait()
        logs = tx.logs.filter((x) => x.constructor.name == "EventLog");
        taskIds.push(logs[0].args.taskId);

        tx = await contract.createTask(0, taskHash, dataHash, 16, cap, {value: taskFee});
        await expect(tx).emit(contract, "TaskPending").withArgs(
            anyValue, anyValue, v.user.address, anyValue, anyValue);
        tx = await tx.wait()
        logs = tx.logs.filter((x) => x.constructor.name == "EventLog");
        taskIds.push(logs[0].args.taskId);

        await v.prepareNetwork(
            ["NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti"],
            [8, 8, 8]
        );

        let queueSize = await v.taskQueueInstance.size();
        assert.equal(queueSize, 2, "Wrong queue size")

        for (let i = 0; i < 3; i++) {
            let nodeTaskId = await v.taskInstance.getNodeTask(v.accounts[i]);
            assert.equal(taskIds[1], nodeTaskId, "Wrong node task id")
        }
    })
})

describe("Task", async () => {
    it("select task with higher task fee", async() => {
        let v = new Verifier();
        await v.init();

        await helpers.setBalance(v.user.address, ethers.parseEther("600"));

        const taskHash = ethers.solidityPackedKeccak256(["string"], ["task hash"]);
        const dataHash = ethers.solidityPackedKeccak256(["string"], ["data hash"]);

        const taskIds = [];

        let contract = v.taskInstance.connect(v.user);
        let tx = await contract.createTask(
            0, taskHash, dataHash, 8, 1, {value: ethers.parseUnits("30", "ether")});
        await expect(tx).emit(contract, "TaskPending").withArgs(
            anyValue, anyValue, v.user.address, anyValue, anyValue);
        tx = await tx.wait()
        let logs = tx.logs.filter((x) => x.constructor.name == "EventLog");
        taskIds.push(logs[0].args.taskId);

        tx = await contract.createTask(
            0, taskHash, dataHash, 8, 2, {value: ethers.parseUnits("60", "ether")});
        await expect(tx).emit(contract, "TaskPending").withArgs(
            anyValue, anyValue, v.user.address, anyValue, anyValue);
        tx = await tx.wait()
        logs = tx.logs.filter((x) => x.constructor.name == "EventLog");
        taskIds.push(logs[0].args.taskId);

        tx = await contract.connect(v.user).createTask(
            0, taskHash, dataHash, 8, 1, {value: ethers.parseUnits("35", "ether")});
        await expect(tx).emit(contract, "TaskPending").withArgs(
            anyValue, anyValue, v.user.address, anyValue, anyValue);
        tx = await tx.wait()
        logs = tx.logs.filter((x) => x.constructor.name == "EventLog");
        taskIds.push(logs[0].args.taskId);

        await v.prepareNetwork(
            ["NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti"],
            [8, 8, 8]
        );

        let queueSize = await v.taskQueueInstance.size();
        assert.equal(queueSize, 2, "Wrong queue size")

        for (let i = 0; i < 3; i++) {
            let nodeTaskId = await v.taskInstance.getNodeTask(v.accounts[i]);
            assert.equal(taskIds[2], nodeTaskId, "Wrong node task id")
        }
    })
})

describe("Task", async () => {
    it("select task correctly when a node is slashed", async () => {
        let v = new Verifier();
        await v.init();

        await helpers.setBalance(v.user.address, ethers.parseEther("600"));

        await v.prepareNetwork(
            ["NVIDIA GeForce GTX 1070", "NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti"],
            [8, 16, 16]
        );

        const taskHash = ethers.solidityPackedKeccak256(["string"], ["task hash"]);
        const dataHash = ethers.solidityPackedKeccak256(["string"], ["data hash"]);

        let tx = await v.taskInstance.connect(v.user).createTask(
            0, taskHash, dataHash, 8, 1, {value: ethers.parseUnits("40", "ether")});
        tx = await tx.wait()
        let logs = tx.logs.filter((x) => x.constructor.name == "EventLog");
        let taskId = logs[0].args.taskId;
        let nodeRounds = {};

        for (let i = 1; i < 4; i++) {
            const nodeAddress = logs[i].args.selectedNode;
            nodeRounds[nodeAddress] = logs[i].args.round;
        }

        await v.taskInstance.connect(v.user).createTask(
            0, taskHash, dataHash, 8, 1, {value: ethers.parseUnits("40", "ether")});

        const result = "0x0102030405060708";
        const errResult = "0x0101010101010101"
        // submit commitment
        for (let i = 0; i < 2; i++) {
            const [commitment, nonce] = await v.getCommitment(result);
            await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce);
        }
        const [errCommitment, errNonce] = await v.getCommitment(errResult);
        await v.taskInstance.connect(v.accounts[2]).submitTaskResultCommitment(
            taskId,
            nodeRounds[v.accounts[2].address],
            errCommitment,
            errNonce,
        );

        // disclose task
        for (let i = 0; i < 2; i++) {
            await v.taskInstance.connect(v.accounts[i]).discloseTaskResult(
                taskId,
                nodeRounds[v.accounts[i].address],
                result,
            );
        }
        await v.taskInstance.connect(v.accounts[2]).discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[2].address],
            errResult,
        );

        await v.taskInstance.connect(v.accounts[0]).reportResultsUploaded(
            taskId,
            nodeRounds[v.accounts[0].address],
        );

        let status = await v.nodeInstance.getNodeStatus(v.accounts[2]);
        assert.equal(status, 0, "Wrong slashed node status");

        let queueSize = await v.taskQueueInstance.size();
        assert.equal(queueSize, 1, "Wrong queue size");

        await v.prepareNode(v.accounts[3], "NVIDIA GeForce GTX 1070", 8)

        queueSize = await v.taskQueueInstance.size();
        assert.equal(queueSize, 0, "Wrong queue size");

        let nodeTaskId = await v.taskInstance.getNodeTask(v.accounts[0]);
        assert.equal(nodeTaskId, 2, "Wrong node task id");
        nodeTaskId = await v.taskInstance.getNodeTask(v.accounts[1]);
        assert.equal(nodeTaskId, 2, "Wrong node task id");
        nodeTaskId = await v.taskInstance.getNodeTask(v.accounts[3]);
        assert.equal(nodeTaskId, 2, "Wrong node task id");
    })
})

describe("Task", async () => {
    it("should abort the cheapest task when task queue is full", async () => {
        let v = new Verifier();
        await v.init();

        await helpers.setBalance(v.user.address, ethers.parseEther("600"));

        const taskHash = ethers.solidityPackedKeccak256(["string"], ["task hash"]);
        const dataHash = ethers.solidityPackedKeccak256(["string"], ["data hash"]);

        await v.taskQueueInstance.updateSizeLimit(3);

        for (let i = 0; i < 3; i++) {
            const tx = v.taskInstance.connect(v.user).createTask(
                0, taskHash, dataHash, 8 + i, 1, {value: ethers.parseUnits(`${10 * (i + 1)}`, "ether")});

            await expect(tx).emit(v.taskInstance, "TaskPending").withArgs(
                anyValue, anyValue, v.user.address, anyValue, anyValue);
        }

        let contract = v.taskInstance.connect(v.user);
        tx = await contract.createTask(
            0, taskHash, dataHash, 8, 1, {value: ethers.parseUnits("40", "ether")});
        await expect(tx).emit(contract, "TaskPending").withArgs(
            anyValue, anyValue, v.user.address, anyValue, anyValue);
        await expect(tx).emit(contract, "TaskAborted").withArgs(1, anyValue);

    })
})
