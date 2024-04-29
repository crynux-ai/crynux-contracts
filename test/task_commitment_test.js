const { assert, expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { Verifier } = require("./utils");

describe("Task", () => {
    it("should allow submitting the task commitments and results correctly", async () => {
        v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const [taskId, nodeRounds, , ] = await v.prepareTask(v.user, v.accounts);

        const [commitment, nonce] = await v.getCommitment("0xdeadbeef");

        try {
            await v.taskInstance.connect(v.accounts[0]).submitTaskResultCommitment(
                ethers.parseUnits("9999"),
                nodeRounds[v.accounts[0].address],
                commitment,
                nonce
            );
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Task not exist/, "Wrong reason: " + e.toString());
        }

        try {
            await v.taskInstance.connect(v.accounts[0]).submitTaskResultCommitment(
                taskId,
                ethers.parseUnits("5"),
                commitment,
                nonce
            );
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Round not exist/, "Wrong reason: " + e.toString());
        }

        try {
            await v.taskInstance.connect(v.accounts[0]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[1].address],
                commitment,
                nonce,);
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Not selected node/, "Wrong reason: " + e.toString());
        }

        await v.taskInstance.connect(v.accounts[0]).submitTaskResultCommitment(
            taskId,
            nodeRounds[v.accounts[0].address],
            commitment,
            nonce,);

        try {
            await v.taskInstance.connect(v.accounts[0]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[0].address],
                commitment,
                nonce);

            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Already submitted/, "Wrong reason: " + e.toString());
        }

        try {
            await v.taskInstance.connect(v.accounts[1]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[0].address],
                commitment,
                nonce);
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Not selected node/, "Wrong reason: " + e.toString());
        }

        try {
            await v.taskInstance.connect(v.accounts[1]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[1].address],
                commitment,
                nonce);
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Nonce already used/, "Wrong reason: " + e.toString());
        }

        const [commitment2, nonce2] = await v.getCommitment("0xdeadbeef02");
        await v.taskInstance.connect(v.accounts[1]).submitTaskResultCommitment(
            taskId,
            nodeRounds[v.accounts[1].address],
            commitment2,
            nonce2);

        const [commitment3, nonce3] = await v.getCommitment("0xdeadbeef03");
        taskContract = await v.taskInstance.connect(v.accounts[2]);
        const commitTx = taskContract.submitTaskResultCommitment(
            taskId,
            nodeRounds[v.accounts[2].address],
            commitment3,
            nonce3);
        await expect(commitTx).emit(taskContract, "TaskResultCommitmentsReady").withArgs(taskId);
    });
});
