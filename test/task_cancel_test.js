const { assert, expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { Verifier, getGasCost } = require("./utils");
const { ethers } = require("hardhat");


describe("Task", () => {
    it("should cancel successfully before task execution", async () => {
        v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        try {
            await v.taskInstance.connect(v.user).cancelTask(1);
        } catch (e) {
            assert.match(e.toString(), /Task not exist/, "Wrong reason: " + e.toString());
        }

        const creatorBalance = await ethers.provider.getBalance(v.user);
        const nodeBalances = [];
        for (let i = 0; i < 3; i++) {
            const balance = await ethers.provider.getBalance(v.accounts[i]);
            nodeBalances.push(balance);
        }
        let [taskId, , , gasCost] = await v.prepareTask(v.user, v.accounts);

        try {
            await v.taskInstance.connect(v.owner).cancelTask(taskId);
        } catch (e) {
            assert.match(e.toString(), /Unauthorized to cancel task/, "Wrong reason: " + e.toString());
        }

        await helpers.time.increase(15 * 60 + 1);
        const taskContract = await  v.taskInstance.connect(v.user);
        const tx = await taskContract.cancelTask(taskId);
        const receipt = await tx.wait();
        gasCost += receipt.gasUsed * receipt.gasPrice;
        await expect(tx).emit(taskContract, "TaskAborted").withArgs(taskId, "Task Cancelled");

        const afterCreatorBalance = await ethers.provider.getBalance(v.user);
        assert.equal(creatorBalance, afterCreatorBalance + gasCost);

        for (let i = 0; i < 3; i++) {
            const balance = await ethers.provider.getBalance(v.accounts[i]);
            assert.equal(nodeBalances[i], balance);
        }
    });
});

describe("Task", (accounts) => {
    it("should not cancel successfully before task deadline", async () => {
        v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const nodeBalances = [];
        for (let i = 0; i < 3; i++) {
            const balance = await ethers.provider.getBalance(v.accounts[i]);
            nodeBalances.push(balance);
        }
        const [taskId, , , ] = await v.prepareTask(v.user, v.accounts);

        try {
            await v.taskInstance.connect(v.user).cancelTask(taskId);
        } catch (e) {
            assert.match(e.toString(), /Task has not exceeded the deadline yet/, "Wrong reason: " + e.toString());
        }
    });
});

describe("Task", (accounts) => {
    it("should cancel successfully when task is in task queue", async () => {
        v = new Verifier();
        await v.init();
        await v.prepareUser(v.user);

        const creatorBalance = await ethers.provider.getBalance(v.user);
        const taskContract = v.taskInstance.connect(v.user);
        let tx = await taskContract.createTask(
            0,
            ethers.solidityPackedKeccak256(["string"], ["task hash"]),
            ethers.solidityPackedKeccak256(["string"], ["data hash"]),
            0,
            1,
            {value: ethers.parseUnits("30", "ether")}
        );
        let receipt = await tx.wait();
        let gasCost = await getGasCost(tx);
        let logs = receipt.logs.filter((x) => x.constructor.name == "EventLog");
        const taskId = logs[0].args.taskId;

        tx = await taskContract.cancelTask(taskId);
        gasCost += await getGasCost(tx);
        await expect(tx).emit(taskContract, "TaskAborted").withArgs(taskId, "Task Cancelled");
        const afterCreatorBalance = await ethers.provider.getBalance(v.user);
        assert.equal(creatorBalance - gasCost, afterCreatorBalance);
    });
});


describe("Task", () => {
    it("should cancel successfully after two nodes disclose", async () => {
        v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const creatorBalance = await ethers.provider.getBalance(v.user);
        const nodeBalances = [];
        for (let i = 0; i < 3; i++) {
            const balance = await ethers.provider.getBalance(v.accounts[i]);
            nodeBalances.push(balance);
        }
        let [taskId, nodeRounds, , gasCost] = await v.prepareTask(v.user, v.accounts);

        const result = "0x0102030405060708";

        const nodeGasCosts = [];
        for (let i = 0; i < 3; i++) {
            const [commitment, nonce] = await v.getCommitment(result);
            const cost = await getGasCost(await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce
            ));
            nodeGasCosts.push(cost);
        }

        for (let i = 0; i < 2; i++) {
            const cost = await getGasCost(await v.taskInstance.connect(v.accounts[i]).discloseTaskResult(
                taskId,
                nodeRounds[v.accounts[i].address],
                result
            ));
            nodeGasCosts[i] += cost;
        }
        
        await helpers.time.increase(15 * 60 + 1)
        const taskContract = await v.taskInstance.connect(v.accounts[0]);
        const tx = await taskContract.cancelTask(taskId);
        nodeGasCosts[0] += await getGasCost(tx);
        await expect(tx).emit(taskContract, "TaskAborted").withArgs(taskId, "Task Cancelled");

        const afterCreatorBalance = await ethers.provider.getBalance(v.user);
        assert.equal(creatorBalance, afterCreatorBalance + ethers.parseUnits("18", "ether") + gasCost);

        let balance = await ethers.provider.getBalance(v.accounts[0]);
        assert.equal(nodeBalances[0] - nodeGasCosts[0], balance);
        balance = await ethers.provider.getBalance(v.accounts[1]);
        assert.equal(nodeBalances[1] + ethers.parseUnits("18", "ether") - nodeGasCosts[1], balance);
        balance = await ethers.provider.getBalance(v.accounts[2]);
        assert.equal(nodeBalances[2] - nodeGasCosts[2], balance);
    });
})

describe("Task", () => {
    it("should cancel successfully after two nodes report error", async () => {
        v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const creatorBalance = await ethers.provider.getBalance(v.user);
        const nodeBalances = [];
        for (let i = 0; i < 3; i++) {
            const balance = await ethers.provider.getBalance(v.accounts[i]);
            nodeBalances.push(balance);
        }
        let [taskId, nodeRounds, , gasCost] = await v.prepareTask(v.user, v.accounts);

        const nodeGasCosts = [];

        for (let i = 0; i < 2; i++) {
            const tx = await v.taskInstance.connect(v.accounts[i]).reportTaskError(
                taskId,
                nodeRounds[v.accounts[i].address]
            );
            nodeGasCosts.push(await getGasCost(tx));
        }

        await helpers.time.increase(15 * 60 + 1)
        const taskContract = await v.taskInstance.connect(v.accounts[2]);
        const tx = await taskContract.cancelTask(taskId);
        nodeGasCosts.push(await getGasCost(tx));
        await expect(tx).not.emit(taskContract, "TaskAborted");

        const afterCreatorBalance = await ethers.provider.getBalance(v.user);
        assert.equal(creatorBalance, afterCreatorBalance + ethers.parseUnits("38", "ether") + gasCost);

        let balance = await ethers.provider.getBalance(v.accounts[0]);
        assert.equal(nodeBalances[0] + ethers.parseUnits("20", "ether") - nodeGasCosts[0], balance);
        balance = await ethers.provider.getBalance(v.accounts[1]);
        assert.equal(nodeBalances[1] + ethers.parseUnits("18", "ether") - nodeGasCosts[1], balance);
        balance = await ethers.provider.getBalance(v.accounts[2]);
        assert.equal(nodeBalances[2] - nodeGasCosts[2], balance);
    });
})
