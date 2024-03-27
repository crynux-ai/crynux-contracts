const { assert, expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { Verifier } = require("./utils");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("Task", () => {
    it("should emit TaskResultUploaded when task.reportResultsUploaded is called", async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);
        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        const result = "0x0102030405060708";

        for(let i= 0; i < 3; i++) {
            const [commitment, nonce] = await v.getCommitment(result);
            await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce
            );
        }

        for(let i = 0; i < 3; i++) {
            await v.taskInstance.connect(v.accounts[i]).discloseTaskResult(
                taskId,
                nodeRounds[v.accounts[i].address],
                result,
            );
        }

        const contract = await v.taskInstance.connect(v.accounts[0]);
        const tx = contract.reportResultsUploaded(
            taskId, nodeRounds[v.accounts[0].address]);
        await expect(tx).emit(contract, "TaskResultUploaded").withArgs(taskId);
    });
});
