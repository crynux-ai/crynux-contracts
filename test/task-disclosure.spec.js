const Node = artifacts.require("Node");
const CrynuxToken = artifacts.require("CrynuxToken");
const Task = artifacts.require("Task");
const truffleAssert = require('truffle-assertions');
const { BN, toWei } = web3.utils;

const { prepareTask, prepareNetwork, prepareUser, getCommitment} = require("./utils");

contract("Task", (accounts) => {
    const gpuName = "NVIDIA GeForce GTX 1070 Ti"
    const gpuVram = 8

    it("should disclose the task result correctly", async () => {

        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNetwork(accounts, cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        try {
            await taskInstance.discloseTaskResult(taskId, nodeRounds[accounts[2]], "0x0102030405060708", {from: accounts[2]});
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Commitments not ready/, "Wrong reason: " + e.toString());
        }

        try {
            await taskInstance.discloseTaskResult(new BN(99999), nodeRounds[accounts[2]], "0x0102030405060708", {from: accounts[2]});
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Task not exist/, "Wrong reason: " + e.toString());
        }

        try {
            await taskInstance.discloseTaskResult(taskId, new BN(5), "0x0102030405060708", {from: accounts[2]});
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Round not exist/, "Wrong reason: " + e.toString());
        }

        try {
            await taskInstance.discloseTaskResult(taskId, nodeRounds[accounts[2]], "0x0102030405060708", {from: accounts[3]});
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Not selected node/, "Wrong reason: " + e.toString());
        }

        try {
            await taskInstance.discloseTaskResult(taskId, nodeRounds[accounts[2]], [], {from: accounts[2]});
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Invalid result/, "Wrong reason: " + e.toString());
        }

        const results = [
            "0xfcd29a0c1f1a1c9bb4b8bbb6d5124a29b9d412353993836f8f87f7699830a499e59ca34cb4691cf2f2c391276149cfb2",
            "0xfcd29a0c1f1a1c9bb4b8bbb6d5124a29b9d416343993836f8f87f72998b0a499e59ca34cb4691cf2f2c39126e149cfb2",
            "0xfcd29a0c1f1a1c9bb4b8bbb6d5124a29b9d416343993836f8f87f7699830a499e59ca34cb4691cf2f2c391276149cfb2"
        ];

        for(let i=0; i<3; i++) {
            const [commitment, nonce] = getCommitment(results[i]);
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
                "0x01020304050607171707060504030201",
                {from: accounts[2]}
            );
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Mismatch result and commitment/, "Wrong reason: " + e.toString());
        }

        // Set the quit and paused status to the first and second node
        await nodeInstance.pause({from: accounts[2]});
        await nodeInstance.quit({from: accounts[3]});

        let node2Status = await nodeInstance.getNodeStatus(accounts[2]);
        assert.equal(node2Status.toNumber(), 3, "wrong node status for node 2");

        let node3Status = await nodeInstance.getNodeStatus(accounts[3]);
        assert.equal(node3Status.toNumber(), 4, "wrong node status for node 3");

        await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[2]],
            results[0],
            {from: accounts[2]}
        );

        const tx = await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[3]],
            results[1],
            {from: accounts[3]}
        );

        truffleAssert.eventEmitted(tx, 'TaskSuccess', (ev) => {
            return ev.taskId.eq(taskId);
        });

        node3Status = await nodeInstance.getNodeStatus(accounts[3]);
        assert.equal(node3Status.toNumber(), 0, "wrong node status for node 3");
        let bal = await cnxInstance.balanceOf(accounts[3]);
        let expectedBalance = nodeBalances[1].add(new BN(toWei("414", "ether")));
        assert.equal(
            bal.toString(),
            expectedBalance.toString(),
            "Task fee not received"
        )

        const availableNodes = await nodeInstance.availableNodes();
        assert.equal(availableNodes, 0, "Wrong number of available nodes");

        await taskInstance.reportResultsUploaded(taskId, nodeRounds[accounts[2]], {from: accounts[2]});
        node2Status = await nodeInstance.getNodeStatus(accounts[2]);
        assert.equal(node2Status.toNumber(), 5, "wrong node status for node 2");
        bal = await cnxInstance.balanceOf(accounts[2]);
        expectedBalance = nodeBalances[0].add(new BN(toWei("20", "ether")));
        assert.equal(
            bal.toString(),
            expectedBalance.toString(),
            "Task fee not received"
        )

        await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[4]],
            results[2],
            {from: accounts[4]}
        );

        bal = await cnxInstance.balanceOf(accounts[4]);
        expectedBalance = nodeBalances[2].add(new BN(toWei("8", "ether")))
        assert.equal(
            bal.toString(),
            expectedBalance.toString(),
            "Task fee not received"
        );

        const availableNodesAfter = await nodeInstance.availableNodes();
        assert.equal(availableNodesAfter, 1, "Node 4 not free");

        const node4Status = await nodeInstance.getNodeStatus(accounts[4]);
        assert.equal(node4Status.toNumber(), 1, "wrong node status for node 4");

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

        await nodeInstance.resume({from: accounts[2]});

        await cnxInstance.approve(nodeInstance.address, new BN(toWei("400", "ether")), {from: accounts[3]});
        await nodeInstance.join(gpuName, gpuVram, {from: accounts[3]});

        const availableNodesStart = await nodeInstance.availableNodes();
        assert.equal(availableNodesStart, 3, "Wrong number of available nodes");

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        const result = "0x01020304050607080807060504030201";
        const cheatingResult = "0x01020304050607171707060504030201"

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

        let tx;
        for(let i= 0; i < 2; i++) {
            tx = await taskInstance.discloseTaskResult(
                taskId,
                nodeRounds[accounts[2 + i]],
                result,
                {from: accounts[2 + i]}
            );
        }

        truffleAssert.eventEmitted(tx, 'TaskSuccess', (ev) => {
            return ev.taskId.eq(taskId);
        });

        const availableNodesAfter = await nodeInstance.availableNodes();
        assert.equal(availableNodesAfter, 1, "Node 3 not free");

        const nodeTaskId = await taskInstance.getNodeTask(accounts[3]);
        assert.equal("0", nodeTaskId.toString(), "incorrect node task");

        const cheatingNodeTaskId = await taskInstance.getNodeTask(accounts[4]);
        assert.equal(taskId.toString(), cheatingNodeTaskId.toString(), "incorrect node task");

        await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[4]],
            cheatingResult,
            {from: accounts[4]}
        );

        const availableNodesAfterSlash = await nodeInstance.availableNodes();
        assert.equal(availableNodesAfterSlash, 1, "Node not slashed");

        let taskInfo = await taskInstance.getTask(taskId);
        assert.equal(taskInfo.id, taskId, "task deleted");

        await taskInstance.reportResultsUploaded(taskId, nodeRounds[accounts[2]], {from: accounts[2]});
        const availableNodesAfterSuccess = await nodeInstance.availableNodes();
        assert.equal(availableNodesAfterSuccess, 2, "Node not slashed");

        taskInfo = await taskInstance.getTask(taskId);
        assert.equal(taskInfo.id, '0', "task not deleted");

        const userBalanceAfter = await cnxInstance.balanceOf(accounts[1]);

        assert.equal(
            userBalanceAfter.toString(),
            userBalance.add(new BN(toWei("8", "ether"))).toString(),
            "task fee not returned"
        );

        let bal = await cnxInstance.balanceOf(accounts[2]);
        assert.equal(
            bal.toString(),
            nodeBalances[0].add(new BN(toWei("20", "ether"))).toString(),
            "task fee not paid"
        );
        bal = await cnxInstance.balanceOf(accounts[3]);
        assert.equal(
            bal.toString(),
            nodeBalances[1].add(new BN(toWei("14", "ether"))).toString(),
            "task fee not paid"
        );

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
        await nodeInstance.join(gpuName, gpuVram, {from: accounts[4]})

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        const result = "0x01020304050607080807060504030201";
        const cheatingResult = "0x01020304050607171707060504030201"

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
        
        let tx;
        for(let i= 1; i < 3; i++) {
            tx = await taskInstance.discloseTaskResult(
                taskId,
                nodeRounds[accounts[2 + i]],
                result,
                {from: accounts[2 + i]}
            );
        }
        truffleAssert.eventEmitted(tx, 'TaskSuccess', (ev) => {
            return ev.taskId.eq(taskId);
        });

        const availableNodesAfter = await nodeInstance.availableNodes();
        // accounts[4] has been kicked out for its recent qos score is 19
        assert.equal(availableNodesAfter, 0, "Node free");

        let taskInfo = await taskInstance.getTask(taskId);
        assert.equal(taskInfo.id, taskId, "task deleted");

        await taskInstance.reportResultsUploaded(taskId, nodeRounds[accounts[3]], {from: accounts[3]});
        const availableNodesAfterSuccess = await nodeInstance.availableNodes();
        // accounts[4] has been kicked out for its recent qos score is 19
        assert.equal(availableNodesAfterSuccess, 1, "Node free");

        taskInfo = await taskInstance.getTask(taskId);
        assert.equal(taskInfo.id, '0', "task not deleted");

        const userBalanceAfter = await cnxInstance.balanceOf(accounts[1]);

        assert.equal(
            userBalanceAfter.toString(),
            userBalance.add(new BN(toWei("14", "ether"))).toString(),
            "task fee not returned"
        );

        let bal = await cnxInstance.balanceOf(accounts[3]);
        assert.equal(
            bal.toString(),
            nodeBalances[1].add(new BN(toWei("17", "ether"))).toString(),
            "task fee not paid"
        );
        bal = await cnxInstance.balanceOf(accounts[4]);
        assert.equal(
            bal.toString(),
            nodeBalances[2].add(new BN(toWei("411", "ether"))).toString(),
            "task fee not paid"
        );

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
        await nodeInstance.join(gpuName, gpuVram, {from: accounts[2]})
        await cnxInstance.approve(nodeInstance.address, new BN(toWei("400", "ether")), {from: accounts[4]})
        await nodeInstance.join(gpuName, gpuVram, {from: accounts[4]})

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        const result = "0x01020304050607080807060504030201";
        const cheatingResult = "0x01020304050607171707060504030201"

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

        const tx = await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[4]],
            result,
            {from: accounts[4]}
        );

        truffleAssert.eventEmitted(tx, 'TaskSuccess', (ev) => {
            return ev.taskId.eq(taskId);
        });

        const availableNodesAfter = await nodeInstance.availableNodes();
        // accounts[4] has been kicked out for its recent qos score is 19
        assert.equal(availableNodesAfter, 0, "Node free");

        let taskInfo = await taskInstance.getTask(taskId);
        assert.equal(taskInfo.id, taskId, "task deleted");

        await taskInstance.reportResultsUploaded(taskId, nodeRounds[accounts[2]], {from: accounts[2]});
        const availableNodesAfterSuccess = await nodeInstance.availableNodes();
        // accounts[4] has been kicked out for its recent qos score is 19
        assert.equal(availableNodesAfterSuccess, 1, "Node free");

        taskInfo = await taskInstance.getTask(taskId);
        assert.equal(taskInfo.id, "0", "task not deleted");

        const userBalanceAfter = await cnxInstance.balanceOf(accounts[1]);

        assert.equal(
            userBalanceAfter.toString(),
            userBalance.add(new BN(toWei("14", "ether"))).toString(),
            "task fee not returned"
        );

        const bal1 = await cnxInstance.balanceOf(accounts[2]);
        assert.equal(
            bal1.toString(),
            nodeBalances[0].add(new BN(toWei("20", "ether"))).toString(),
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
            nodeBalances[2].add(new BN(toWei("408", "ether"))).toString(),
            "task fee not paid"
        );

        for (let i = 0; i < 3; i++) {
            const nodeTaskId = await taskInstance.getNodeTask(accounts[2 + i]);
            assert.equal("0", nodeTaskId.toString(), "incorrect node task");
        }
    });
});
