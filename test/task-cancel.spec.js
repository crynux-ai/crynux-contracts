const Node = artifacts.require("Node");
const CrynuxToken = artifacts.require("CrynuxToken");
const Task = artifacts.require("Task");
const truffleAssert = require('truffle-assertions');
const { BN, toWei } = web3.utils;
const { promisify } = require('util');
const web3Send = promisify(web3.currentProvider.send);


const { prepareTask, prepareNetwork, prepareUser, getCommitment } = require("./utils");

contract("Task", (accounts) => {
    it("should cancel successfully before task execution", async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNetwork(accounts, cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);

        try {
            await taskInstance.cancelTask(1, { from: accounts[1] });
        } catch (e) {
            assert.match(e.toString(), /Task not exist/, "Wrong reason: " + e.toString());
        }

        const creatorBalance = await cnxInstance.balanceOf(accounts[1]);
        const nodeBalances = [];
        for (let i = 2; i <= 4; i++) {
            const balance = await cnxInstance.balanceOf(accounts[i]);
            nodeBalances.push(balance);
        }
        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        try {
            await taskInstance.cancelTask(taskId, { from: accounts[0] });
        } catch (e) {
            assert.match(e.toString(), /Unauthorized to cancel task/, "Wrong reason: " + e.toString());
        }

        try {
            await taskInstance.cancelTask(taskId, { from: accounts[1] });
        } catch (e) {
            assert.match(e.toString(), /Task has not exceeded the deadline yet/, "Wrong reason: " + e.toString());
        }

        await web3Send({ jsonrpc: "2.0", method: "evm_increaseTime", params: [15 * 60 + 1], id: 123 });
        await web3Send({ jsonrpc: "2.0", method: "evm_mine", params: [], id: 0 });
        const tx = await taskInstance.cancelTask(taskId, { from: accounts[1] });
        truffleAssert.eventEmitted(tx, 'TaskAborted', (ev) => {
            return ev.taskId.toString() === taskId.toString();
        });

        const afterCreatorBalance = await cnxInstance.balanceOf(accounts[1]);
        assert.equal(creatorBalance.toString(), afterCreatorBalance.toString());

        for (let i = 2; i <= 4; i++) {
            const balance = await cnxInstance.balanceOf(accounts[i]);
            assert.equal(nodeBalances[i - 2].toString(), balance.toString());
        }
    });

    it("should cancel successfully after two nodes disclose", async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();


        const creatorBalance = await cnxInstance.balanceOf(accounts[1]);
        const nodeBalances = [];
        for (let i = 2; i <= 4; i++) {
            const balance = await cnxInstance.balanceOf(accounts[i]);
            nodeBalances.push(balance);
        }
        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        const result = "0x0102030405060708";

        for (let i = 0; i < 3; i++) {
            const [commitment, nonce] = getCommitment(result);
            await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[2 + i]],
                commitment,
                nonce,
                {from: accounts[2 + i]}
            );
        }

        for (let i = 0; i < 2; i++) {
            await taskInstance.discloseTaskResult(
                taskId,
                nodeRounds[accounts[2 + i]],
                result,
                {from: accounts[2 + i]}
            );
        }

        await web3Send({ jsonrpc: "2.0", method: "evm_increaseTime", params: [15 * 60 + 1], id: 123 });
        await web3Send({ jsonrpc: "2.0", method: "evm_mine", params: [], id: 0 });
        const tx = await taskInstance.cancelTask(taskId, { from: accounts[4] });
        truffleAssert.eventEmitted(tx, 'TaskAborted', (ev) => {
            return ev.taskId.toString() === taskId.toString();
        });

        const afterCreatorBalance = await cnxInstance.balanceOf(accounts[1]);
        assert.equal(creatorBalance.toString(), afterCreatorBalance.add(new BN(toWei("10", "ether"))).toString());

        let balance = await cnxInstance.balanceOf(accounts[2]);
        assert.equal(nodeBalances[0].toString(), balance.toString());
        balance = await cnxInstance.balanceOf(accounts[3]);
        assert.equal(nodeBalances[1].add(new BN(toWei("10", "ether"))).toString(), balance.toString());
        balance = await cnxInstance.balanceOf(accounts[4]);
        assert.equal(nodeBalances[2].toString(), balance.toString());
    });

    it("should cancel successfully after two nodes report error", async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();


        const creatorBalance = await cnxInstance.balanceOf(accounts[1]);
        const nodeBalances = [];
        for (let i = 2; i <= 4; i++) {
            const balance = await cnxInstance.balanceOf(accounts[i]);
            nodeBalances.push(balance);
        }
        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        for (let i = 0; i < 2; i++) {
            await taskInstance.reportTaskError(
                taskId,
                nodeRounds[accounts[2 + i]],
                {from: accounts[2 + i]}
            );
        }

        await web3Send({ jsonrpc: "2.0", method: "evm_increaseTime", params: [15 * 60 + 1], id: 123 });
        await web3Send({ jsonrpc: "2.0", method: "evm_mine", params: [], id: 0 });
        const tx = await taskInstance.cancelTask(taskId, { from: accounts[4] });
        truffleAssert.eventNotEmitted(tx, 'TaskAborted', (ev) => {
            return ev.taskId.toString() === taskId.toString();
        });

        const afterCreatorBalance = await cnxInstance.balanceOf(accounts[1]);
        assert.equal(creatorBalance.toString(), afterCreatorBalance.add(new BN(toWei("20", "ether"))).toString());

        let balance = await cnxInstance.balanceOf(accounts[2]);
        assert.equal(nodeBalances[0].add(new BN(toWei("10", "ether"))).toString(), balance.toString());
        balance = await cnxInstance.balanceOf(accounts[3]);
        assert.equal(nodeBalances[1].add(new BN(toWei("10", "ether"))).toString(), balance.toString());
        balance = await cnxInstance.balanceOf(accounts[4]);
        assert.equal(nodeBalances[2].toString(), balance.toString());
    });
});
