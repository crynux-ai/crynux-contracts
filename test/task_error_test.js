const { assert, expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { Verifier, getGasCost } = require("./utils");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { ethers } = require("hardhat");

describe("Task", () => {
    it("should slash the normal node and abort the task in the order: normal, err, err", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const [taskId, nodeRounds, , ] = await v.prepareTask(v.user, v.accounts);

        const result = "0x0102030405060708";

        const nodeBal = await ethers.provider.getBalance(v.accounts[0].address);
        // Normal
        const [commitment, nonce] = await v.getCommitment(result);
        const gasCost = await getGasCost(await v.taskInstance.connect(v.accounts[0]).submitTaskResultCommitment(
            taskId,
            nodeRounds[v.accounts[0].address],
            commitment,
            nonce));

        // Error
        await v.taskInstance.connect(v.accounts[1]).reportTaskError(
            taskId, nodeRounds[v.accounts[1].address]);

        // Error
        let contract = v.taskInstance.connect(v.accounts[2]);
        let tx = await contract.reportTaskError(
            taskId, nodeRounds[v.accounts[2].address]);
        await expect(tx).emit(contract, "TaskAborted").withArgs(taskId, anyValue);

        let nullTaskId = await v.taskInstance.getNodeTask(v.accounts[0]);
        assert.equal(nullTaskId, 0, "wrong task id");
        nullTaskId = await v.taskInstance.getNodeTask(v.accounts[1]);
        assert.equal(nullTaskId, 0, "wrong task id");
        nullTaskId = await v.taskInstance.getNodeTask(v.accounts[2]);
        assert.equal(nullTaskId, 0, "wrong task id");

        let nodeStatus = await v.nodeInstance.getNodeStatus(v.accounts[0]);
        assert.equal(nodeStatus, 0, "wrong node status");

        const nodeBalAfter = await ethers.provider.getBalance(v.accounts[0]);
        assert.equal(nodeBal - gasCost, nodeBalAfter, "wrong node balance");

        const task = await v.taskInstance.getTask(taskId);
        assert.equal(task.id, 0, "task not deleted");
    });
})

describe("Task", () => {
    it("should slash the normal node and abort the task in the order: err, normal, err", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);
        const result = "0x0102030405060708";

        const nodeBal = await ethers.provider.getBalance(v.accounts[1]);

        // Error
        await v.taskInstance.connect(v.accounts[0]).reportTaskError(
            taskId, nodeRounds[v.accounts[0].address]);

        // Normal
        const [commitment, nonce] = await v.getCommitment(result);
        const gasCost = await getGasCost(await v.taskInstance.connect(v.accounts[1]).submitTaskResultCommitment(
            taskId,
            nodeRounds[v.accounts[1].address],
            commitment,
            nonce));

        // Error
        let contract = v.taskInstance.connect(v.accounts[2]);
        let tx = await contract.reportTaskError(
            taskId, nodeRounds[v.accounts[2].address]);
        await expect(tx).emit(contract, "TaskAborted").withArgs(taskId, anyValue);

        let nullTaskId = await await v.taskInstance.getNodeTask(v.accounts[0])
        assert.equal(nullTaskId, 0, "wrong task id")
        nullTaskId = await await v.taskInstance.getNodeTask(v.accounts[1])
        assert.equal(nullTaskId, 0, "wrong task id")
        nullTaskId = await await v.taskInstance.getNodeTask(v.accounts[2])
        assert.equal(nullTaskId, 0, "wrong task id")

        let nodeStatus = await v.nodeInstance.getNodeStatus(v.accounts[1]);
        assert.equal(nodeStatus, 0, "wrong node status");

        const nodeBalAfter = await ethers.provider.getBalance(v.accounts[1]);

        assert.equal(nodeBal - gasCost, nodeBalAfter, "wrong node balance");

        const task = await v.taskInstance.getTask(taskId);
        assert.equal(task.id, 0, "task not deleted");
    });
})

describe("Task", () => {
    it("should reject the normal node and abort the task in the order: err, err, normal", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);
        const result = "0x0102030405060708";

        // Error
        await v.taskInstance.connect(v.accounts[0]).reportTaskError(
            taskId, nodeRounds[v.accounts[0].address]);

        // Error
        let contract = await v.taskInstance.connect(v.accounts[1]);
        let tx = contract.reportTaskError(
            taskId, nodeRounds[v.accounts[1].address]);

        await expect(tx).emit(contract, "TaskAborted").withArgs(taskId, anyValue);

        let nullTaskId = await await v.taskInstance.getNodeTask(v.accounts[0])
        assert.equal(nullTaskId, 0, "wrong task id")
        nullTaskId = await await v.taskInstance.getNodeTask(v.accounts[1])
        assert.equal(nullTaskId, 0, "wrong task id")

        // Normal
        const [commitment, nonce] = await v.getCommitment(result);
        try {
            await v.taskInstance.connect(v.accounts[2]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[2].address],
                commitment,
                nonce);
        } catch (e) {
            assert.match(e.toString(), /Task is aborted/, "Wrong reason: " + e.toString());
        }
        await v.taskInstance.connect(v.accounts[2]).reportTaskError(
            taskId, nodeRounds[v.accounts[2].address]);
        nullTaskId = await await v.taskInstance.getNodeTask(v.accounts[2])
        assert.equal(nullTaskId, 0, "wrong task id")

        let nodeStatus = await v.nodeInstance.getNodeStatus(v.accounts[0]);
        assert.equal(nodeStatus, 1, "wrong node status");
        nodeStatus = await v.nodeInstance.getNodeStatus(v.accounts[1]);
        assert.equal(nodeStatus, 1, "wrong node status");
        nodeStatus = await v.nodeInstance.getNodeStatus(v.accounts[2]);
        assert.equal(nodeStatus, 1, "wrong node status");

        const task = await v.taskInstance.getTask(taskId);
        assert.equal(task.id, 0, "task not deleted");
    });
})

describe("Task", () => {
    it("should slash the error node in the order: err, normal, normal", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);
        const result = "0x0102030405060708";

        const nodeBal = await ethers.provider.getBalance(v.accounts[0]);

        // Error
        const gasCost = await getGasCost(await v.taskInstance.connect(v.accounts[0]).reportTaskError(
            taskId, nodeRounds[v.accounts[0].address]));

        // Normal
        const [commitment, nonce] = await v.getCommitment(result);
        await v.taskInstance.connect(v.accounts[1]).submitTaskResultCommitment(
            taskId,
            nodeRounds[v.accounts[1].address],
            commitment,
            nonce);

        // Normal
        const [commitment2, nonce2] = await v.getCommitment(result);
        let contract = await v.taskInstance.connect(v.accounts[2]);
        let tx = contract.submitTaskResultCommitment(
            taskId,
            nodeRounds[v.accounts[2].address],
            commitment2,
            nonce2);

        await expect(tx).emit(contract, "TaskResultCommitmentsReady").withArgs(taskId);

        await v.taskInstance.connect(v.accounts[1]).discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[1].address],
            result
        );

        contract = await v.taskInstance.connect(v.accounts[2]);
        tx = contract.discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[2].address],
            result);
        await expect(tx).emit(contract, "TaskSuccess").withArgs(taskId, anyValue, anyValue);


        let nullTaskId = await await v.taskInstance.getNodeTask(v.accounts[0])
        assert.equal(nullTaskId, 0, "wrong task id")

        const nodeStatus = await v.nodeInstance.getNodeStatus(v.accounts[0]);
        assert.equal(nodeStatus, 0, "wrong node status");

        const nodeBalAfter = await ethers.provider.getBalance(v.accounts[0]);
        assert.equal(nodeBal - gasCost, nodeBalAfter, "wrong node balance");

        await v.taskInstance.connect(v.accounts[1]).reportResultsUploaded(
            taskId,
            nodeRounds[v.accounts[1].address],
        )

        const nodeStatusSuccess = await v.nodeInstance.getNodeStatus(v.accounts[1]);
        assert.equal(nodeStatusSuccess, 1, "wrong node status");
    });
})

describe("Task", () => {
    it("should slash the error node in the order: normal, err, normal", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);
        const result = "0x0102030405060708";

        const nodeBal = await ethers.provider.getBalance(v.accounts[1]);

        // Normal
        const [commitment, nonce] = await v.getCommitment(result);
        await v.taskInstance.connect(v.accounts[0]).submitTaskResultCommitment(
            taskId,
            nodeRounds[v.accounts[0].address],
            commitment,
            nonce);

        // Error
        const gasCost = await getGasCost(await v.taskInstance.connect(v.accounts[1]).reportTaskError(
            taskId, nodeRounds[v.accounts[1].address]));

        // Normal
        const [commitment2, nonce2] = await v.getCommitment(result);
        let contract = await v.taskInstance.connect(v.accounts[2]);
        let tx = contract.submitTaskResultCommitment(
            taskId,
            nodeRounds[v.accounts[2].address],
            commitment2,
            nonce2);

        await expect(tx).emit(contract, "TaskResultCommitmentsReady").withArgs(taskId);

        await v.taskInstance.connect(v.accounts[0]).discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[0].address],
            result,
        );

        contract = v.taskInstance.connect(v.accounts[2]);
        tx = await contract.discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[2].address],
            result,
        );

        await expect(tx).emit(contract, "TaskSuccess").withArgs(taskId, anyValue, anyValue);

        let nullTaskId = await await v.taskInstance.getNodeTask(v.accounts[1])
        assert.equal(nullTaskId, 0, "wrong task id")

        const nodeStatus = await v.nodeInstance.getNodeStatus(v.accounts[1]);
        assert.equal(nodeStatus, 0, "wrong node status");

        const nodeBalAfter = await ethers.provider.getBalance(v.accounts[1]);
        assert.equal(nodeBal - gasCost, nodeBalAfter, "wrong node balance");

        await v.taskInstance.connect(v.accounts[0]).reportResultsUploaded(
            taskId,
            nodeRounds[v.accounts[0].address],
        )

        const nodeStatusSuccess = await v.nodeInstance.getNodeStatus(v.accounts[0]);
        assert.equal(nodeStatusSuccess, 1, "wrong node status");

    });
})

describe("Task", () => {
    it("should slash the error node in the order: normal, normal, err", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);
        const result = "0x0102030405060708";

        const nodeBal = await ethers.provider.getBalance(v.accounts[2]);

        // Normal
        const [commitment, nonce] = await v.getCommitment(result);
        await v.taskInstance.connect(v.accounts[0]).submitTaskResultCommitment(
            taskId,
            nodeRounds[v.accounts[0].address],
            commitment,
            nonce);

        // Normal
        const [commitment2, nonce2] = await v.getCommitment(result);
        await v.taskInstance.connect(v.accounts[1]).submitTaskResultCommitment(
            taskId,
            nodeRounds[v.accounts[1].address],
            commitment2,
            nonce2);

        // Error
        let contract = v.taskInstance.connect(v.accounts[2]);
        let tx = await contract.reportTaskError(
            taskId,
            nodeRounds[v.accounts[2].address]);
        const gasCost = await getGasCost(tx);

        await expect(tx).emit(contract, "TaskResultCommitmentsReady").withArgs(taskId);

        await v.taskInstance.connect(v.accounts[0]).discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[0].address],
            result,
        );

        contract = v.taskInstance.connect(v.accounts[1]);
        tx = contract.discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[1].address],
            result,
        );

        await expect(tx).emit(contract, "TaskSuccess").withArgs(taskId, anyValue, anyValue);

        let nullTaskId = await await v.taskInstance.getNodeTask(v.accounts[2])
        assert.equal(nullTaskId, 0, "wrong task id")

        const nodeStatus = await v.nodeInstance.getNodeStatus(v.accounts[2]);
        assert.equal(nodeStatus, 0, "wrong node status");

        const nodeBalAfter = await ethers.provider.getBalance(v.accounts[2]);
        assert.equal(nodeBal - gasCost, nodeBalAfter, "wrong node balance");

        await v.taskInstance.connect(v.accounts[0]).reportResultsUploaded(
            taskId,
            nodeRounds[v.accounts[0].address],
        )

        const nodeStatusSuccess = await v.nodeInstance.getNodeStatus(v.accounts[0]);
        assert.equal(nodeStatusSuccess, 1, "wrong node status");
    });
})

describe("Task", () => {
    it("should abort the task in the order: err, err, err", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        const nodeBal = await ethers.provider.getBalance(v.accounts[2]);
        // Error
        await v.taskInstance.connect(v.accounts[0]).reportTaskError(
            taskId, nodeRounds[v.accounts[0].address]);

        // Error
        let contract = v.taskInstance.connect(v.accounts[1]);
        let tx = await contract.reportTaskError(
            taskId, nodeRounds[v.accounts[1].address]);

        await expect(tx).emit(contract, "TaskAborted").withArgs(taskId, anyValue);

        let nullTaskId = await v.taskInstance.getNodeTask(v.accounts[0])
        assert.equal(nullTaskId, 0, "wrong task id")
        nullTaskId = await v.taskInstance.getNodeTask(v.accounts[1])
        assert.equal(nullTaskId, 0, "wrong task id")

        // Error
        const gasCost = await getGasCost(await v.taskInstance.connect(v.accounts[2]).reportTaskError(
            taskId, nodeRounds[v.accounts[2].address]));
        nullTaskId = await v.taskInstance.getNodeTask(v.accounts[2])
        assert.equal(nullTaskId, 0, "wrong task id")

        const nodeStatus = await v.nodeInstance.getNodeStatus(v.accounts[2]);
        assert.equal(nodeStatus, 1, "wrong node status");

        const nodeBalAfter = await ethers.provider.getBalance(v.accounts[2]);
        assert.equal(nodeBal + ethers.parseUnits("12", "ether") - gasCost, nodeBalAfter, "wrong node balance");

        const task = await v.taskInstance.getTask(taskId);
        assert.equal(task.id, 0, "task not deleted");
    });
})
