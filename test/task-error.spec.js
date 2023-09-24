const Node = artifacts.require("Node");
const CrynuxToken = artifacts.require("CrynuxToken");
const Task = artifacts.require("Task");

const truffleAssert = require('truffle-assertions');
const { prepareTask, prepareNetwork, prepareUser, getCommitment, prepareNode } = require("./utils");

contract("Task", (accounts) => {

    it("should slash the normal node and abort the task in the order: normal, err, err", async() => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNetwork(accounts, cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        const result = "0x0102030405060708";

        // Normal
        const [commitment, nonce] = getCommitment(result);
        await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[2]],
                commitment,
                nonce,
                {from: accounts[2]});

        // Error
        await taskInstance.reportTaskError(taskId, nodeRounds[accounts[3]], {from: accounts[3]});
        let nullTaskId = await taskInstance.getNodeTask(accounts[3]);
        assert.equal(nullTaskId, 0, "wrong task id");

        // Error
        const tx = await taskInstance.reportTaskError(taskId, nodeRounds[accounts[4]], {from: accounts[4]});
        nullTaskId = await taskInstance.getNodeTask(accounts[4]);
        assert.equal(nullTaskId, 0, "wrong task id");

        truffleAssert.eventEmitted(tx, 'TaskAborted', (ev) => {
            return ev.taskId.eq(taskId);
        });

        let nodeStatus = await nodeInstance.getNodeStatus(accounts[2]);
        assert.equal(nodeStatus.toNumber(), 2, "wrong node status");

        await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[2]],
            result,
            {from: accounts[2]}
        );

        nodeStatus = await nodeInstance.getNodeStatus(accounts[2]);
        assert.equal(nodeStatus.toNumber(), 0, "wrong node status");

        const nodeBal = await cnxInstance.balanceOf(accounts[2]);
        assert.equal(nodeBal.toNumber(), 0, "wrong node balance");

        const task = await taskInstance.getTask(taskId);
        assert.equal(task.id, 0, "task not deleted");
    });

    it("should slash the normal node and abort the task in the order: err, normal, err", async() => {

        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNode(accounts[2], cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);
        const result = "0x0102030405060708";

        // Error
        await taskInstance.reportTaskError(taskId, nodeRounds[accounts[2]], {from: accounts[2]});
        let nullTaskId = await await taskInstance.getNodeTask(accounts[2])
        assert.equal(nullTaskId, 0, "wrong task id")

        // Normal
        const [commitment, nonce] = getCommitment(result);
        await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[3]],
                commitment,
                nonce,
                {from: accounts[3]});

        // Error
        const tx = await taskInstance.reportTaskError(taskId, nodeRounds[accounts[4]], {from: accounts[4]});
        nullTaskId = await await taskInstance.getNodeTask(accounts[4])
        assert.equal(nullTaskId, 0, "wrong task id")

        truffleAssert.eventEmitted(tx, 'TaskAborted', (ev) => {
            return ev.taskId.eq(taskId);
        });

        let nodeStatus = await nodeInstance.getNodeStatus(accounts[3]);
        assert.equal(nodeStatus.toNumber(), 2, "wrong node status");

        await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[3]],
            result,
            {from: accounts[3]}
        );

        nodeStatus = await nodeInstance.getNodeStatus(accounts[3]);
        assert.equal(nodeStatus.toNumber(), 0, "wrong node status");

        const nodeBal = await cnxInstance.balanceOf(accounts[3]);

        assert.equal(nodeBal.toString(), "10000000000000000000", "wrong node balance");

        const task = await taskInstance.getTask(taskId);
        assert.equal(task.id, 0, "task not deleted");
    });

    it("should slash the normal node and abort the task in the order: err, err, normal", async() => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNode(accounts[3], cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);
        const result = "0x0102030405060708";

        // Error
        await taskInstance.reportTaskError(taskId, nodeRounds[accounts[2]], {from: accounts[2]});
        let nullTaskId = await await taskInstance.getNodeTask(accounts[2])
        assert.equal(nullTaskId, 0, "wrong task id")

        // Error
        const tx = await taskInstance.reportTaskError(taskId, nodeRounds[accounts[3]], {from: accounts[3]});
        nullTaskId = await await taskInstance.getNodeTask(accounts[3])
        assert.equal(nullTaskId, 0, "wrong task id")


        truffleAssert.eventEmitted(tx, 'TaskAborted', (ev) => {
            return ev.taskId.eq(taskId);
        });

        // Normal
        const [commitment, nonce] = getCommitment(result);
        await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[4]],
                commitment,
                nonce,
                {from: accounts[4]});

        await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[4]],
            result,
            {from: accounts[4]}
        );

        const nodeStatus = await nodeInstance.getNodeStatus(accounts[4]);
        assert.equal(nodeStatus.toNumber(), 0, "wrong node status");

        const nodeBal = await cnxInstance.balanceOf(accounts[4]);
        assert.equal(nodeBal.toString(), "20000000000000000000", "wrong node balance");

        const task = await taskInstance.getTask(taskId);
        assert.equal(task.id, 0, "task not deleted");
    });

    it("should slash the error node in the order: err, normal, normal", async() => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNode(accounts[4], cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);
        const result = "0x0102030405060708";

        // Error
        await taskInstance.reportTaskError(taskId, nodeRounds[accounts[2]], {from: accounts[2]});
        let nullTaskId = await await taskInstance.getNodeTask(accounts[2])
        assert.equal(nullTaskId, 0, "wrong task id")

        // Normal
        const [commitment, nonce] = getCommitment(result);
        await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[3]],
                commitment,
                nonce,
                {from: accounts[3]});

        // Normal
        const [commitment2, nonce2] = getCommitment(result);
        let tx = await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[4]],
                commitment2,
                nonce2,
                {from: accounts[4]});

        truffleAssert.eventEmitted(tx, 'TaskResultCommitmentsReady', (ev) => {
            return ev.taskId.eq(taskId);
        });

        await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[3]],
            result,
            {from: accounts[3]}
        );

        tx = await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[4]],
            result,
            {from: accounts[4]}
        );

        truffleAssert.eventEmitted(tx, 'TaskSuccess', (ev) => {
            return ev.taskId.eq(taskId);
        });

        const nodeStatus = await nodeInstance.getNodeStatus(accounts[2]);
        assert.equal(nodeStatus.toNumber(), 0, "wrong node status");

        const nodeBal = await cnxInstance.balanceOf(accounts[2]);
        assert.equal(nodeBal.toString(), "20000000000000000000", "wrong node balance");

        await taskInstance.reportTaskSuccess(
            taskId,
            nodeRounds[accounts[3]],
            {from: accounts[3]}
        )

        const nodeStatusSuccess = await nodeInstance.getNodeStatus(accounts[3]);
        assert.equal(nodeStatusSuccess.toNumber(), 1, "wrong node status");
    });

    it("should slash the error node in the order: normal, err, normal", async() => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNode(accounts[2], cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);
        const result = "0x0102030405060708";

        // Normal
        const [commitment, nonce] = getCommitment(result);
        await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[2]],
                commitment,
                nonce,
                {from: accounts[2]});

        // Error
        await taskInstance.reportTaskError(taskId, nodeRounds[accounts[3]], {from: accounts[3]});
        let nullTaskId = await await taskInstance.getNodeTask(accounts[3])
        assert.equal(nullTaskId, 0, "wrong task id")

        // Normal
        const [commitment2, nonce2] = getCommitment(result);
        let tx = await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[4]],
                commitment2,
                nonce2,
                {from: accounts[4]});

        truffleAssert.eventEmitted(tx, 'TaskResultCommitmentsReady', (ev) => {
            return ev.taskId.eq(taskId);
        });

        await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[2]],
            result,
            {from: accounts[2]}
        );

        tx = await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[4]],
            result,
            {from: accounts[4]}
        );

        truffleAssert.eventEmitted(tx, 'TaskSuccess', (ev) => {
            return ev.taskId.eq(taskId);
        });

        const nodeStatus = await nodeInstance.getNodeStatus(accounts[3]);
        assert.equal(nodeStatus.toNumber(), 0, "wrong node status");

        const nodeBal = await cnxInstance.balanceOf(accounts[3]);
        assert.equal(nodeBal.toString(), "30000000000000000000", "wrong node balance");

        await taskInstance.reportTaskSuccess(
            taskId,
            nodeRounds[accounts[2]],
            {from: accounts[2]}
        )

        const nodeStatusSuccess = await nodeInstance.getNodeStatus(accounts[2]);
        assert.equal(nodeStatusSuccess.toNumber(), 1, "wrong node status");

    });

    it("should slash the error node in the order: normal, normal, err", async() => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNode(accounts[3], cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);
        const result = "0x0102030405060708";

        // Normal
        const [commitment, nonce] = getCommitment(result);
        await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[2]],
                commitment,
                nonce,
                {from: accounts[2]});

        // Normal
        const [commitment2, nonce2] = getCommitment(result);
        await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[3]],
                commitment2,
                nonce2,
                {from: accounts[3]});

        // Error
        let tx = await taskInstance.reportTaskError(taskId, nodeRounds[accounts[4]], {from: accounts[4]});
        let nullTaskId = await await taskInstance.getNodeTask(accounts[4])
        assert.equal(nullTaskId, 0, "wrong task id")

        truffleAssert.eventEmitted(tx, 'TaskResultCommitmentsReady', (ev) => {
            return ev.taskId.eq(taskId);
        });

        await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[2]],
            result,
            {from: accounts[2]}
        );

        tx = await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[3]],
            result,
            {from: accounts[3]}
        );

        truffleAssert.eventEmitted(tx, 'TaskSuccess', (ev) => {
            return ev.taskId.eq(taskId);
        });

        const nodeStatus = await nodeInstance.getNodeStatus(accounts[4]);
        assert.equal(nodeStatus.toNumber(), 0, "wrong node status");

        const nodeBal = await cnxInstance.balanceOf(accounts[4]);
        assert.equal(nodeBal.toString(), "40000000000000000000", "wrong node balance");

        await taskInstance.reportTaskSuccess(
            taskId,
            nodeRounds[accounts[2]],
            {from: accounts[2]}
        )

        const nodeStatusSuccess = await nodeInstance.getNodeStatus(accounts[2]);
        assert.equal(nodeStatusSuccess.toNumber(), 1, "wrong node status");
    });

    it("should abort the task in the order: err, err, err", async() => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNode(accounts[4], cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);
        const result = "0x0102030405060708";

        // Error
        await taskInstance.reportTaskError(taskId, nodeRounds[accounts[2]], {from: accounts[2]});
        let nullTaskId = await await taskInstance.getNodeTask(accounts[2])
        assert.equal(nullTaskId, 0, "wrong task id")

        // Error
        let tx = await taskInstance.reportTaskError(taskId, nodeRounds[accounts[3]], {from: accounts[3]});
        nullTaskId = await await taskInstance.getNodeTask(accounts[3])
        assert.equal(nullTaskId, 0, "wrong task id")

        truffleAssert.eventEmitted(tx, 'TaskAborted', (ev) => {
            return ev.taskId.eq(taskId);
        });

        // Error
        await taskInstance.reportTaskError(taskId, nodeRounds[accounts[4]], {from: accounts[4]});
        nullTaskId = await await taskInstance.getNodeTask(accounts[4])
        assert.equal(nullTaskId, 0, "wrong task id")

        const nodeStatus = await nodeInstance.getNodeStatus(accounts[4]);
        assert.equal(nodeStatus.toNumber(), 1, "wrong node status");

        const nodeBal = await cnxInstance.balanceOf(accounts[4]);
        assert.equal(nodeBal.toString(), "50000000000000000000", "wrong node balance");

        const task = await taskInstance.getTask(taskId);
        assert.equal(task.id, 0, "task not deleted");
    });
});
