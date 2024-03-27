const { assert, expect, use } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { Verifier } = require("./utils");


describe("Task", () => {
    it("should abort the task when 3 different results are submitted", async () => {
        v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        const results = ["0x0102030405060708", "0x010203040506f7f8", "0x0102030405060807"];

        for(let i= 0; i < 3; i++) {
            const [commitment, nonce] = await v.getCommitment(results[i]);
            await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce,
            );
        }

        const nodeBalances = [];

        for(let i= 0; i < 3; i++) {
            const bal = await v.cnxInstance.balanceOf(v.accounts[i]);
            nodeBalances.push(bal);
        }

        const userBalance = await v.cnxInstance.balanceOf(v.user);
        let tx;
        let taskContract;

        for(let i = 0; i < 3; i++) {
            taskContract = await v.taskInstance.connect(v.accounts[i]);
            tx = await taskContract.discloseTaskResult(
                taskId,
                nodeRounds[v.accounts[i].address],
                results[i],
            );
        }
        await expect(tx).emit(taskContract, "TaskAborted").withArgs(taskId, "Task result illegal");

        const availableNodes = await v.netstatsInstance.availableNodes();
        assert.equal(availableNodes, 3, "Nodes not free");

        const userBalanceAfter = await v.cnxInstance.balanceOf(v.user);

        assert.equal(
            userBalanceAfter,
            userBalance + ethers.parseUnits("50", "ether"),
            "Task fee not returned"
        )

        for(let i= 0; i < 3; i++) {
            const bal = await v.cnxInstance.balanceOf(v.accounts[i]);

            assert.equal(bal, nodeBalances[i], "Task fee paid");
        }
    });
});
