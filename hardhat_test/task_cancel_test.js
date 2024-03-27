const { assert, expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { Verifier } = require("./utils");

describe("Task", (accounts) => {
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

        const creatorBalance = await v.cnxInstance.balanceOf(v.user);
        const nodeBalances = [];
        for (let i = 0; i < 3; i++) {
            const balance = await v.cnxInstance.balanceOf(v.accounts[i]);
            nodeBalances.push(balance);
        }
        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        try {
            await v.taskInstance.connect(v.owner).cancelTask(taskId);
        } catch (e) {
            assert.match(e.toString(), /Unauthorized to cancel task/, "Wrong reason: " + e.toString());
        }

        await network.provider.send("evm_increaseTime", [15 * 60 + 1]);
        await network.provider.send("evm_mine", []);
        const taskContract = await  v.taskInstance.connect(v.user);
        const tx = taskContract.cancelTask(taskId);
        await expect(tx).emit(taskContract, "TaskAborted").withArgs(taskId, "Task Cancelled");

        const afterCreatorBalance = await v.cnxInstance.balanceOf(v.user);
        assert.equal(creatorBalance.toString(), afterCreatorBalance.toString());

        for (let i = 0; i < 3; i++) {
            const balance = await v.cnxInstance.balanceOf(v.accounts[i]);
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

        const creatorBalance = await v.cnxInstance.balanceOf(v.user);
        const nodeBalances = [];
        for (let i = 0; i < 3; i++) {
            const balance = await v.cnxInstance.balanceOf(v.accounts[i]);
            nodeBalances.push(balance);
        }
        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

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

        const creatorBalance = await v.cnxInstance.balanceOf(v.user);
        const taskContract = v.taskInstance.connect(v.user);
        let tx = await taskContract.createTask(
            0,
            ethers.solidityPackedKeccak256(["string"], ["task hash"]),
            ethers.solidityPackedKeccak256(["string"], ["data hash"]),
            0,
            ethers.parseUnits("30", "ether"),
            1,
        );
        tx = await tx.wait();
        let logs = tx.logs.filter((x) => x.constructor.name == "EventLog");
        const taskId = logs[0].args.taskId;

        tx = taskContract.cancelTask(taskId);
        await expect(tx).emit(taskContract, "TaskAborted").withArgs(taskId, "Task Cancelled");
        const afterCreatorBalance = await v.cnxInstance.balanceOf(v.user);
        assert.equal(creatorBalance.toString(), afterCreatorBalance.toString());
    });
});


describe("Task", (accounts) => {
    it("should cancel successfully after two nodes disclose", async () => {
        v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const creatorBalance = await v.cnxInstance.balanceOf(v.user);
        const nodeBalances = [];
        for (let i = 0; i < 3; i++) {
            const balance = await v.cnxInstance.balanceOf(v.accounts[i]);
            nodeBalances.push(balance);
        }
        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        const result = "0x0102030405060708";

        for (let i = 0; i < 3; i++) {
            const [commitment, nonce] = await v.getCommitment(result);
            await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce
            );
        }

        for (let i = 0; i < 2; i++) {
            await v.taskInstance.connect(v.accounts[i]).discloseTaskResult(
                taskId,
                nodeRounds[v.accounts[i].address],
                result
            );
        }

        await network.provider.send("evm_increaseTime", [15 * 60 + 1]);
        await network.provider.send("evm_mine", []);
        const taskContract = await v.taskInstance.connect(v.accounts[0]);
        const tx = taskContract.cancelTask(taskId);
        await expect(tx).emit(taskContract, "TaskAborted").withArgs(taskId, "Task Cancelled");

        const afterCreatorBalance = await v.cnxInstance.balanceOf(v.user);
        assert.equal(creatorBalance, afterCreatorBalance + ethers.parseUnits("18", "ether"));

        let balance = await v.cnxInstance.balanceOf(v.accounts[0]);
        assert.equal(nodeBalances[0], balance);
        balance = await v.cnxInstance.balanceOf(v.accounts[1]);
        assert.equal(nodeBalances[1] + ethers.parseUnits("18", "ether"), balance);
        balance = await v.cnxInstance.balanceOf(v.accounts[2]);
        assert.equal(nodeBalances[2], balance);
    });
})

describe("Task", (accounts) => {
    it("should cancel successfully after two nodes report error", async () => {
        v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const creatorBalance = await v.cnxInstance.balanceOf(v.user);
        const nodeBalances = [];
        for (let i = 0; i < 3; i++) {
            const balance = await v.cnxInstance.balanceOf(v.accounts[i]);
            nodeBalances.push(balance);
        }
        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        for (let i = 0; i < 2; i++) {
            await v.taskInstance.connect(v.accounts[i]).reportTaskError(
                taskId,
                nodeRounds[v.accounts[i].address]
            );
        }

        await network.provider.send("evm_increaseTime", [15 * 60 + 1]);
        await network.provider.send("evm_mine", []);
        const taskContract = await v.taskInstance.connect(v.accounts[2]);
        const tx = taskContract.cancelTask(taskId);
        await expect(tx).not.emit(taskContract, "TaskAborted");

        const afterCreatorBalance = await v.cnxInstance.balanceOf(v.user);
        assert.equal(creatorBalance, afterCreatorBalance + ethers.parseUnits("38", "ether"));

        let balance = await v.cnxInstance.balanceOf(v.accounts[0]);
        assert.equal(nodeBalances[0] + ethers.parseUnits("20", "ether"), balance);
        balance = await v.cnxInstance.balanceOf(v.accounts[1]);
        assert.equal(nodeBalances[1] + ethers.parseUnits("18", "ether"), balance);
        balance = await v.cnxInstance.balanceOf(v.accounts[2]);
        assert.equal(nodeBalances[2], balance);
    });
})
