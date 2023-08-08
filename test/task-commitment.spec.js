const Node = artifacts.require("Node");
const CrynuxToken = artifacts.require("CrynuxToken");
const Task = artifacts.require("Task");

const truffleAssert = require('truffle-assertions');
const { BN } = web3.utils;

const { getCommitment, prepareTask, prepareNetwork, prepareUser } = require("./utils");

contract("Task", (accounts) => {
    it("should allow submitting the task commitments and results correctly", async () => {

        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNetwork(accounts, cnxInstance, nodeInstance);

        const taskInstance = await Task.deployed();
        await prepareUser(accounts[1], cnxInstance, taskInstance);

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        const [commitment, nonce] = getCommitment("committed result");

        try {
            await taskInstance.submitTaskResultCommitment(
                new BN(9999),
                nodeRounds[accounts[2]],
                commitment,
                nonce,
                {from: accounts[2]}
            );
        } catch (e) {
            assert.match(e.toString(), /Task not exist/, "Wrong reason: " + e.toString());
        }

        try {
            await taskInstance.submitTaskResultCommitment(
                taskId,
                new BN(5),
                commitment,
                nonce,
                {from: accounts[2]}
            );
        } catch (e) {
            assert.match(e.toString(), /Round not exist/, "Wrong reason: " + e.toString());
        }

        try {
            await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[3]],
                commitment,
                nonce,
                {from: accounts[2]});
        } catch (e) {
            assert.match(e.toString(), /Not selected node/, "Wrong reason: " + e.toString());
        }

        await taskInstance.submitTaskResultCommitment(
            taskId,
            nodeRounds[accounts[2]],
            commitment,
            nonce,
            {from: accounts[2]});

        try {
            await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[2]],
                commitment,
                nonce,
                {from: accounts[2]});
        } catch (e) {
            assert.match(e.toString(), /Already submitted/, "Wrong reason: " + e.toString());
        }

        try {
            await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[2]],
                commitment,
                nonce,
                {from: accounts[3]});
        } catch (e) {
            assert.match(e.toString(), /Not selected node/, "Wrong reason: " + e.toString());
        }

        try {
            await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[3]],
                commitment,
                nonce,
                {from: accounts[3]});
        } catch (e) {
            assert.match(e.toString(), /Nonce already used/, "Wrong reason: " + e.toString());
        }

        const [commitment2, nonce2] = getCommitment("committed result 2");
        await taskInstance.submitTaskResultCommitment(
            taskId,
            nodeRounds[accounts[3]],
            commitment2,
            nonce2,
            {from: accounts[3]});

        const [commitment3, nonce3] = getCommitment("committed result 3");
        const commitTx = await taskInstance.submitTaskResultCommitment(
            taskId,
            nodeRounds[accounts[4]],
            commitment3,
            nonce3,
            {from: accounts[4]});

        truffleAssert.eventEmitted(commitTx, 'TaskResultCommitmentsReady', (ev) => {
            return ev.taskId.eq(taskId);
        });
    });
});