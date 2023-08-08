const Node = artifacts.require("Node");
const CrynuxToken = artifacts.require("CrynuxToken");
const Task = artifacts.require("Task");
const truffleAssert = require('truffle-assertions');
const { BN, toWei } = web3.utils;

const { prepareTask, prepareNetwork, prepareUser, getCommitment} = require("./utils");

contract("Task", (accounts) => {
    it("should disclose the task result correctly", async () => {

        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNetwork(accounts, cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        try {
            await taskInstance.discloseTaskResult(taskId, nodeRounds[accounts[2]], "0x0102030405060708", {from: accounts[2]});
        } catch (e) {
            assert.match(e.toString(), /Commitments not ready/, "Wrong reason: " + e.toString());
        }

        try {
            await taskInstance.discloseTaskResult(new BN(99999), nodeRounds[accounts[2]], "0x0102030405060708", {from: accounts[2]});
        } catch (e) {
            assert.match(e.toString(), /Task not exist/, "Wrong reason: " + e.toString());
        }

        try {
            await taskInstance.discloseTaskResult(taskId, new BN(5), "0x0102030405060708", {from: accounts[2]});
        } catch (e) {
            assert.match(e.toString(), /Round not exist/, "Wrong reason: " + e.toString());
        }

        try {
            await taskInstance.discloseTaskResult(taskId, nodeRounds[accounts[2]], "0x0102030405060708", {from: accounts[3]});
        } catch (e) {
            assert.match(e.toString(), /Not selected node/, "Wrong reason: " + e.toString());
        }

        const result = "0x0102030405060708";

        for(let i=0; i<3; i++) {
            const [commitment, nonce] = getCommitment(result);
            await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[2 + i]],
                commitment,
                nonce,
                {from: accounts[2 + i]}
            );
        }

        const nodeBalances = [];

        for(let i= 0; i < 3; i++) {
            const bal = await cnxInstance.balanceOf(accounts[2 + i]);
            nodeBalances.push(bal);
        }

        try {
            await taskInstance.discloseTaskResult(
                taskId,
                nodeRounds[accounts[2]],
                "0x0102030405060717",
                {from: accounts[2]}
            );
        } catch (e) {
            assert.match(e.toString(), /Mismatch result and commitment/, "Wrong reason: " + e.toString());
        }

        await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[2]],
            result,
            {from: accounts[2]}
        );

        const tx = await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[3]],
            result,
            {from: accounts[3]}
        );

        truffleAssert.eventEmitted(tx, 'TaskSuccess', (ev) => {
            return ev.taskId.eq(taskId);
        });

        for(let i= 0; i < 2; i++) {
            const bal = await cnxInstance.balanceOf(accounts[2 + i]);
            assert.equal(
                bal.toString(),
                nodeBalances[i].add(new BN(toWei("10", "ether"))).toString(),
                "Task fee not received"
            );
        }

        const availableNodes = await nodeInstance.availableNodes();
        assert.equal(availableNodes, 2, "Nodes not free");

        try {
            await nodeInstance.quit({from: accounts[4]});
        } catch (e) {
            assert.match(e.toString(), /Task not finished/, "Wrong reason: " + e.toString());
        }

        try {
            await nodeInstance.pause({from: accounts[4]});
        } catch (e) {
            assert.match(e.toString(), /Task not finished/, "Wrong reason: " + e.toString());
        }

        await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[4]],
            result,
            {from: accounts[4]}
        );

        const bal3 = await cnxInstance.balanceOf(accounts[4]);
        assert.equal(
            bal3.toString(),
            nodeBalances[2].add(new BN(toWei("10", "ether"))).toString(),
            "Task fee not received"
        );

        const availableNodesAfter = await nodeInstance.availableNodes();
        assert.equal(availableNodesAfter, 3, "Node not free");

        const taskInfo = await taskInstance.getTask(taskId);
        assert.equal(taskInfo.id, '0', "task not deleted");

        for (let i = 0; i < 3; i++) {
            const nodeTaskId = await taskInstance.getNodeTask(accounts[2 + i]);
            assert.equal("0", nodeTaskId.toString(), "incorrect node task");
        }
    });

    it('should slash the last cheating node', async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        const result = "0x0102030405060708";
        const cheatingResult = "0x0102030405060717"

        for(let i= 0; i < 2; i++) {
            const [commitment, nonce] = getCommitment(result);
            await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[2 + i]],
                commitment,
                nonce,
                {from: accounts[2 + i]}
            );
        }

        const [commitment, nonce] = getCommitment(cheatingResult);
        await taskInstance.submitTaskResultCommitment(
            taskId,
            nodeRounds[accounts[4]],
            commitment,
            nonce,
            {from: accounts[4]}
        );

        const nodeBalances = [];

        for(let i= 0; i < 3; i++) {
            const bal = await cnxInstance.balanceOf(accounts[2 + i]);
            nodeBalances.push(bal);
        }

        const userBalance = await cnxInstance.balanceOf(accounts[1]);

        for(let i= 0; i < 2; i++) {
            await taskInstance.discloseTaskResult(
                taskId,
                nodeRounds[accounts[2 + i]],
                result,
                {from: accounts[2 + i]}
            );
        }

        const availableNodesAfter = await nodeInstance.availableNodes();
        assert.equal(availableNodesAfter, 2, "Node not free");

        for (let i = 0; i < 2; i++) {
            const nodeTaskId = await taskInstance.getNodeTask(accounts[2 + i]);
            assert.equal("0", nodeTaskId.toString(), "incorrect node task");
        }

        const cheatingNodeTaskId = await taskInstance.getNodeTask(accounts[4]);
        assert.equal(taskId.toString(), cheatingNodeTaskId.toString(), "incorrect node task");

        await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[4]],
            cheatingResult,
            {from: accounts[4]}
        );

        const availableNodesAfterSlash = await nodeInstance.availableNodes();
        assert.equal(availableNodesAfterSlash, 2, "Node not slashed");

        const taskInfo = await taskInstance.getTask(taskId);
        assert.equal(taskInfo.id, '0', "task not deleted");

        const userBalanceAfter = await cnxInstance.balanceOf(accounts[1]);

        assert.equal(
            userBalanceAfter.toString(),
            userBalance.add(new BN(toWei("10", "ether"))).toString(),
            "task fee not returned"
        );

        for(let i= 0; i < 2; i++) {
            const bal = await cnxInstance.balanceOf(accounts[2 + i]);
            assert.equal(
                bal.toString(),
                nodeBalances[i].add(new BN(toWei("10", "ether"))).toString(),
                "task fee not paid"
            );
        }

        const slashedNodeBalance = await cnxInstance.balanceOf(accounts[4]);
        assert.equal(
            nodeBalances[2].toString(),
            slashedNodeBalance.toString(),
            "slashed node still paid"
        );

        for (let i = 0; i < 3; i++) {
            const nodeTaskId = await taskInstance.getNodeTask(accounts[2 + i]);
            assert.equal("0", nodeTaskId.toString(), "incorrect node task");
        }
    });

    it('should slash the first cheating node', async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await cnxInstance.transfer(accounts[4], new BN(toWei("400", "ether")));
        await cnxInstance.approve(nodeInstance.address, new BN(toWei("400", "ether")), {from: accounts[4]})
        await nodeInstance.join({from: accounts[4]})

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        const result = "0x0102030405060708";
        const cheatingResult = "0x0102030405060717"

        for(let i= 1; i < 3; i++) {
            const [commitment, nonce] = getCommitment(result);
            await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[2 + i]],
                commitment,
                nonce,
                {from: accounts[2 + i]}
            );
        }

        const [commitment, nonce] = getCommitment(cheatingResult);
        await taskInstance.submitTaskResultCommitment(
            taskId,
            nodeRounds[accounts[2]],
            commitment,
            nonce,
            {from: accounts[2]}
        );

        const nodeBalances = [];

        for(let i= 0; i < 3; i++) {
            const bal = await cnxInstance.balanceOf(accounts[2 + i]);
            nodeBalances.push(bal);
        }

        const userBalance = await cnxInstance.balanceOf(accounts[1]);

        await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[2]],
            cheatingResult,
            {from: accounts[2]}
        );

        for(let i= 1; i < 3; i++) {
            await taskInstance.discloseTaskResult(
                taskId,
                nodeRounds[accounts[2 + i]],
                result,
                {from: accounts[2 + i]}
            );
        }

        const availableNodesAfter = await nodeInstance.availableNodes();
        assert.equal(availableNodesAfter, 2, "Node free");

        const taskInfo = await taskInstance.getTask(taskId);
        assert.equal(taskInfo.id, '0', "task not deleted");

        const userBalanceAfter = await cnxInstance.balanceOf(accounts[1]);

        assert.equal(
            userBalanceAfter.toString(),
            userBalance.add(new BN(toWei("10", "ether"))).toString(),
            "task fee not returned"
        );

        for(let i= 1; i < 3; i++) {
            const bal = await cnxInstance.balanceOf(accounts[2 + i]);
            assert.equal(
                bal.toString(),
                nodeBalances[i].add(new BN(toWei("10", "ether"))).toString(),
                "task fee not paid"
            );
        }

        const slashedNodeBalance = await cnxInstance.balanceOf(accounts[2]);
        assert.equal(
            nodeBalances[0].toString(),
            slashedNodeBalance.toString(),
            "slashed node still paid"
        );

        for (let i = 0; i < 3; i++) {
            const nodeTaskId = await taskInstance.getNodeTask(accounts[2 + i]);
            assert.equal("0", nodeTaskId.toString(), "incorrect node task");
        }
    });

    it('should slash the second cheating node', async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await cnxInstance.transfer(accounts[2], new BN(toWei("400", "ether")));
        await cnxInstance.approve(nodeInstance.address, new BN(toWei("400", "ether")), {from: accounts[2]})
        await nodeInstance.join({from: accounts[2]})

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        const result = "0x0102030405060708";
        const cheatingResult = "0x0102030405060717"

        const [commitment1, nonce1] = getCommitment(result);
        await taskInstance.submitTaskResultCommitment(
            taskId,
            nodeRounds[accounts[2]],
            commitment1,
            nonce1,
            {from: accounts[2]}
        );

        const [commitment2, nonce2] = getCommitment(cheatingResult);
        await taskInstance.submitTaskResultCommitment(
            taskId,
            nodeRounds[accounts[3]],
            commitment2,
            nonce2,
            {from: accounts[3]}
        );

        const [commitment3, nonce3] = getCommitment(result);
        await taskInstance.submitTaskResultCommitment(
            taskId,
            nodeRounds[accounts[4]],
            commitment3,
            nonce3,
            {from: accounts[4]}
        );

        const nodeBalances = [];

        for(let i= 0; i < 3; i++) {
            const bal = await cnxInstance.balanceOf(accounts[2 + i]);
            nodeBalances.push(bal);
        }

        const userBalance = await cnxInstance.balanceOf(accounts[1]);

        await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[2]],
            result,
            {from: accounts[2]}
        );

        await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[3]],
            cheatingResult,
            {from: accounts[3]}
        );

        await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[4]],
            result,
            {from: accounts[4]}
        );

        const availableNodesAfter = await nodeInstance.availableNodes();
        assert.equal(availableNodesAfter, 2, "Node free");

        const taskInfo = await taskInstance.getTask(taskId);
        assert.equal(taskInfo.id, '0', "task not deleted");

        const userBalanceAfter = await cnxInstance.balanceOf(accounts[1]);

        assert.equal(
            userBalanceAfter.toString(),
            userBalance.add(new BN(toWei("10", "ether"))).toString(),
            "task fee not returned"
        );

        const bal1 = await cnxInstance.balanceOf(accounts[2]);
        assert.equal(
            bal1.toString(),
            nodeBalances[0].add(new BN(toWei("10", "ether"))).toString(),
            "task fee not paid"
        );

        const slashedNodeBalance = await cnxInstance.balanceOf(accounts[3]);
        assert.equal(
            nodeBalances[1].toString(),
            slashedNodeBalance.toString(),
            "slashed node still paid"
        );

        const bal2 = await cnxInstance.balanceOf(accounts[4]);
        assert.equal(
            bal2.toString(),
            nodeBalances[2].add(new BN(toWei("10", "ether"))).toString(),
            "task fee not paid"
        );

        for (let i = 0; i < 3; i++) {
            const nodeTaskId = await taskInstance.getNodeTask(accounts[2 + i]);
            assert.equal("0", nodeTaskId.toString(), "incorrect node task");
        }
    });
});
