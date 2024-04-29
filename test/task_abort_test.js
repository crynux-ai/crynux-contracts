const { assert, expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { Verifier } = require("./utils");
const { ethers } = require("hardhat");


describe("Task", () => {
    it("should abort the task when 3 different results are submitted", async () => {
        v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const [taskId, nodeRounds, , ] = await v.prepareTask(v.user, v.accounts);

        const results = ["0x0102030405060708", "0x010203040506f7f8", "0x0102030405060807"];

        const nodeGasCosts = [0, 0, 0];
        const nodeBalances = [];

        for(let i= 0; i < 3; i++) {
            const bal = await ethers.provider.getBalance(v.accounts[i]);
            nodeBalances.push(bal);
        }

        for(let i= 0; i < 3; i++) {
            const [commitment, nonce] = await v.getCommitment(results[i]);
            const tx = await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce,
            );
            const receipt = await tx.wait();

            nodeGasCosts[i] = receipt.gasUsed * receipt.gasPrice;
        }

        const userBalance = await ethers.provider.getBalance(v.user);
        let tx;
        let taskContract;

        for(let i = 0; i < 3; i++) {
            taskContract = await v.taskInstance.connect(v.accounts[i]);
            tx = await taskContract.discloseTaskResult(
                taskId,
                nodeRounds[v.accounts[i].address],
                results[i],
            );
            const receipt = await tx.wait();
            nodeGasCosts[i] += receipt.gasUsed * receipt.gasPrice;
        }
        await expect(tx).emit(taskContract, "TaskAborted").withArgs(taskId, "Task result illegal");

        const availableNodes = await v.netstatsInstance.availableNodes();
        assert.equal(availableNodes, 3, "Nodes not free");

        const userBalanceAfter = await ethers.provider.getBalance(v.user);

        assert.equal(
            userBalanceAfter,
            userBalance + ethers.parseUnits("50", "ether"),
            "Task fee not returned"
        )

        for(let i= 0; i < 3; i++) {
            const bal = await ethers.provider.getBalance(v.accounts[i]);

            assert.equal(bal + nodeGasCosts[i], nodeBalances[i], "Task fee paid");
        }
    });
});
