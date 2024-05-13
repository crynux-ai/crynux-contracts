const { assert, expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { Verifier, getGasCost } = require("./utils");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { ethers } = require("hardhat");


describe("Task", () => {
    const gpuName = "NVIDIA GeForce GTX 1070 Ti"
    const gpuVram = 8

    it("should disclose the task result correctly", async () => {
        let v = new Verifier();
        await v.init();

        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const [taskId, nodeRounds, , ] = await v.prepareTask(v.user, v.accounts);

        try {
            await v.taskInstance.connect(v.accounts[0]).discloseTaskResult(
                taskId, nodeRounds[v.accounts[0].address], "0x0102030405060708");
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Commitments not ready/, "Wrong reason: " + e.toString());
        }

        try {
            await v.taskInstance.connect(v.accounts[0]).discloseTaskResult(
                ethers.parseUnits("99999"),
                nodeRounds[v.accounts[0].address],
                "0x0102030405060708");
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Task not exist/, "Wrong reason: " + e.toString());
        }

        try {
            await v.taskInstance.connect(v.accounts[0]).discloseTaskResult(
                taskId, ethers.parseUnits("5"), "0x0102030405060708");
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Round not exist/, "Wrong reason: " + e.toString());
        }

        try {
            await v.taskInstance.connect(v.accounts[1]).discloseTaskResult(
                taskId, nodeRounds[v.accounts[0].address], "0x0102030405060708");
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Not selected node/, "Wrong reason: " + e.toString());
        }

        try {
            await v.taskInstance.connect(v.accounts[0]).discloseTaskResult(
                taskId, nodeRounds[v.accounts[0].address], "0x");
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Invalid result/, "Wrong reason: " + e.toString());
        }

        const results = [
            "0xfcd29a0c1f1a1c9bb4b8bbb6d5124a29b9d412353993836f8f87f7699830a499e59ca34cb4691cf2f2c391276149cfb2",
            "0xfcd29a0c1f1a1c9bb4b8bbb6d5124a29b9d416343993836f8f87f72998b0a499e59ca34cb4691cf2f2c39126e149cfb2",
            "0xfcd29a0c1f1a1c9bb4b8bbb6d5124a29b9d416343993836f8f87f7699830a499e59ca34cb4691cf2f2c391276149cfb2"
        ];

        const nodeBalances = [];

        for(let i= 0; i < 3; i++) {
            const bal = await ethers.provider.getBalance(v.accounts[i]);
            nodeBalances.push(bal);
        }

        const nodeGasCosts = [BigInt("0"), BigInt("0"), BigInt("0")];

        for(let i=0; i<3; i++) {
            const [commitment, nonce] = await v.getCommitment(results[i]);
            const tx = await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce,
            );
            nodeGasCosts[i] += await getGasCost(tx);
        }

        try {
            await v.taskInstance.connect(v.accounts[0]).discloseTaskResult(
                taskId,
                nodeRounds[v.accounts[0].address],
                "0x01020304050607171707060504030201",
            );
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Mismatch result and commitment/, "Wrong reason: " + e.toString());
        }

        // Set the quit and paused status to the first and second node
        nodeGasCosts[0] += await getGasCost(await v.nodeInstance.connect(v.accounts[0]).pause());
        nodeGasCosts[1] += await getGasCost(await v.nodeInstance.connect(v.accounts[1]).quit());

        let node0Status = await v.nodeInstance.getNodeStatus(v.accounts[0]);
        assert.equal(node0Status, 3, "wrong node status for node 0");

        let node1Status = await v.nodeInstance.getNodeStatus(v.accounts[1]);
        assert.equal(node1Status, 4, "wrong node status for node 1");

        nodeGasCosts[0] += await getGasCost(await v.taskInstance.connect(v.accounts[0]).discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[0].address],
            results[0],
        ));

        const taskContract = v.taskInstance.connect(v.accounts[1]);
        const tx = await taskContract.discloseTaskResult(taskId,
            nodeRounds[v.accounts[1].address],
            results[1],
        );
        nodeGasCosts[1] += await getGasCost(tx);
        await expect(tx).emit(taskContract, "TaskSuccess").withArgs(
            taskId, anyValue, anyValue);

        node1Status = await v.nodeInstance.getNodeStatus(v.accounts[1]);
        assert.equal(node1Status, 0, "wrong node status for node 1");
        let bal = await ethers.provider.getBalance(v.accounts[1]);
        let expectedBalance = nodeBalances[1] + ethers.parseUnits("418", "ether") - nodeGasCosts[1];
        assert.equal(bal, expectedBalance, "Task fee not received")

        const availableNodes = await v.netstatsInstance.availableNodes();
        assert.equal(availableNodes, 0, "Wrong number of available nodes");

        nodeGasCosts[0] += await getGasCost(await v.taskInstance.connect(v.accounts[0]).reportResultsUploaded(
            taskId, nodeRounds[v.accounts[0].address]));
        node0Status = await v.nodeInstance.getNodeStatus(v.accounts[0]);
        assert.equal(node0Status, 5, "wrong node status for node 2");
        bal = await ethers.provider.getBalance(v.accounts[0]);
        expectedBalance = nodeBalances[0] + ethers.parseUnits("20", "ether") - nodeGasCosts[0];
        assert.equal(bal, expectedBalance, "Task fee not received")

        nodeGasCosts[2] += await getGasCost(await v.taskInstance.connect(v.accounts[2]).discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[2].address],
            results[2],
        ));

        bal = await ethers.provider.getBalance(v.accounts[2].address);
        expectedBalance = nodeBalances[2] + ethers.parseUnits("12", "ether") - nodeGasCosts[2];
        assert.equal(bal, expectedBalance, "Task fee not received");

        const availableNodesAfter = await v.netstatsInstance.availableNodes();
        assert.equal(availableNodesAfter, 1, "Node 4 not free");

        const node2Status = await v.nodeInstance.getNodeStatus(v.accounts[2]);
        assert.equal(node2Status, 1, "wrong node status for node 2");

        const taskInfo = await v.taskInstance.getTask(taskId);
        assert.equal(taskInfo.id, '0', "task not deleted");

        for (let i = 0; i < 3; i++) {
            const nodeTaskId = await v.taskInstance.getNodeTask(v.accounts[i].address);
            assert.equal(0, nodeTaskId, "incorrect node task");
        }
    });

    it('should slash the last cheating node', async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const availableNodesStart = await v.netstatsInstance.availableNodes();
        assert.equal(availableNodesStart, 3, "Wrong number of available nodes");

        const [taskId, nodeRounds, , ] = await v.prepareTask(v.user, v.accounts);

        const userBalance = await ethers.provider.getBalance(v.user);

        const result = "0x01020304050607080807060504030201";
        const cheatingResult = "0x01020304050607171707060504030201"

        const nodeBalances = [];

        for(let i= 0; i < 3; i++) {
            const bal = await ethers.provider.getBalance(v.accounts[i]);
            nodeBalances.push(bal);
        }

        const nodeGasCosts = [BigInt("0"), BigInt("0"), BigInt("0")];

        for(let i= 0; i < 2; i++) {
            const [commitment, nonce] = await v.getCommitment(result);
            const tx = await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce,
            );
            nodeGasCosts[i] += await getGasCost(tx);
        }

        const [commitment, nonce] = await v.getCommitment(cheatingResult);
        nodeGasCosts[2] += await getGasCost(await v.taskInstance.connect(v.accounts[2]).submitTaskResultCommitment(
            taskId,
            nodeRounds[v.accounts[2].address],
            commitment,
            nonce,
        ));

        nodeGasCosts[0] += await getGasCost(await v.taskInstance.connect(v.accounts[0]).discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[0].address],
            result,
        ));

        const contract = v.taskInstance.connect(v.accounts[1]);
        const tx = await contract.discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[1].address],
            result,
        );
        nodeGasCosts[1] += await getGasCost(tx);
        await expect(tx).emit(contract, "TaskSuccess").withArgs(
            taskId, anyValue, anyValue);

        const availableNodesAfter = await v.netstatsInstance.availableNodes();
        assert.equal(availableNodesAfter, 1, "Node 3 not free");

        const nodeTaskId = await v.taskInstance.getNodeTask(v.accounts[1]);
        assert.equal(0, nodeTaskId, "incorrect node task");

        const cheatingNodeTaskId = await v.taskInstance.getNodeTask(v.accounts[2]);
        assert.equal(taskId, cheatingNodeTaskId, "incorrect node task");

        nodeGasCosts[2] += await getGasCost(await v.taskInstance.connect(v.accounts[2]).discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[2].address],
            cheatingResult,
        ));

        const availableNodesAfterSlash = await v.netstatsInstance.availableNodes();
        assert.equal(availableNodesAfterSlash, 1, "Node not slashed");

        let taskInfo = await v.taskInstance.getTask(taskId);
        assert.equal(taskInfo.id, taskId, "task deleted");

        nodeGasCosts[0] += await getGasCost(await v.taskInstance.connect(v.accounts[0]).reportResultsUploaded(
            taskId, nodeRounds[v.accounts[0].address]));
        const availableNodesAfterSuccess = await v.netstatsInstance.availableNodes();
        assert.equal(availableNodesAfterSuccess, 2, "Node not slashed");

        taskInfo = await v.taskInstance.getTask(taskId);
        assert.equal(taskInfo.id, '0', "task not deleted");

        const userBalanceAfter = await ethers.provider.getBalance(v.user);

        assert.equal(
            userBalanceAfter,
            userBalance + ethers.parseUnits("12", "ether"),
            "task fee not returned"
        );

        let bal = await ethers.provider.getBalance(v.accounts[0]);
        assert.equal(
            bal,
            nodeBalances[0] + ethers.parseUnits("20", "ether") - nodeGasCosts[0],
            "task fee not paid"
        );
        bal = await ethers.provider.getBalance(v.accounts[1]);
        assert.equal(
            bal,
            nodeBalances[1] + ethers.parseUnits("18", "ether") - nodeGasCosts[1],
            "task fee not paid"
        );

        const slashedNodeBalance = await ethers.provider.getBalance(v.accounts[2]);
        assert.equal(
            slashedNodeBalance,
            nodeBalances[2] - nodeGasCosts[2],
            "slashed node still paid"
        );

        for (let i = 0; i < 3; i++) {
            const nodeTaskId = await v.taskInstance.getNodeTask(v.accounts[i]);
            assert.equal(0, nodeTaskId, "incorrect node task");
        }
    });

    it('should slash the first cheating node', async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        const result = "0x01020304050607080807060504030201";
        const cheatingResult = "0x01020304050607171707060504030201"

        const userBalance = await ethers.provider.getBalance(v.user);

        const nodeBalances = [];

        for(let i= 0; i < 3; i++) {
            const bal = await ethers.provider.getBalance(v.accounts[i]);
            nodeBalances.push(bal);
        }

        const nodeGasCosts = [BigInt("0"), BigInt("0"), BigInt("0")];

        for(let i = 1; i < 3; i++) {
            const [commitment, nonce] = await v.getCommitment(result);
            nodeGasCosts[i] += await getGasCost(await v.taskInstance.connect(v.accounts[i]).submitTaskResultCommitment(
                taskId,
                nodeRounds[v.accounts[i].address],
                commitment,
                nonce,
            ));
        }

        const [commitment, nonce] = await v.getCommitment(cheatingResult);
        nodeGasCosts[0] += await getGasCost(await v.taskInstance.connect(v.accounts[0]).submitTaskResultCommitment(
            taskId,
            nodeRounds[v.accounts[0].address],
            commitment,
            nonce,
        ));


        nodeGasCosts[0] += await getGasCost(await v.taskInstance.connect(v.accounts[0]).discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[0].address],
            cheatingResult,
        ));

        nodeGasCosts[1] += await getGasCost(await v.taskInstance.connect(v.accounts[1]).discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[1].address],
            result,
        ));

        const contract = v.taskInstance.connect(v.accounts[2]);
        const tx = await contract.discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[2].address],
            result,
        );
        nodeGasCosts[2] += await getGasCost(tx);
        await expect(tx).emit(contract, "TaskSuccess").withArgs(
            taskId, anyValue, anyValue);

        const availableNodesAfter = await v.netstatsInstance.availableNodes();
        assert.equal(availableNodesAfter, 1, "Node free");

        let taskInfo = await v.taskInstance.getTask(taskId);
        assert.equal(taskInfo.id, taskId, "task deleted");

        nodeGasCosts[1] += await getGasCost(await v.taskInstance.connect(v.accounts[1]).reportResultsUploaded(
            taskId, nodeRounds[v.accounts[1].address]));
        const availableNodesAfterSuccess = await v.netstatsInstance.availableNodes();
        assert.equal(availableNodesAfterSuccess, 2, "Node free");

        taskInfo = await v.taskInstance.getTask(taskId);
        assert.equal(taskInfo.id, '0', "task not deleted");

        const userBalanceAfter = await ethers.provider.getBalance(v.user);

        assert.equal(
            userBalanceAfter,
            userBalance + ethers.parseUnits("16", "ether"),
            "task fee not returned"
        );

        let bal = await ethers.provider.getBalance(v.accounts[1]);
        assert.equal(
            bal,
            nodeBalances[1] + ethers.parseUnits("19", "ether") - nodeGasCosts[1],
            "task fee not paid"
        );
        bal = await ethers.provider.getBalance(v.accounts[2]);
        assert.equal(
            bal,
            nodeBalances[2] + ethers.parseUnits("15", "ether") - nodeGasCosts[2],
            "task fee not paid"
        );

        const slashedNodeBalance = await ethers.provider.getBalance(v.accounts[0]);
        assert.equal(
            nodeBalances[0] - nodeGasCosts[0],
            slashedNodeBalance,
            "slashed node still paid"
        );

        for (let i = 0; i < 3; i++) {
            const nodeTaskId = await v.taskInstance.getNodeTask(v.accounts[i]);
            assert.equal("0", nodeTaskId.toString(), "incorrect node task");
        }
    });

    it('should slash the second cheating node', async () => {
        let v = new Verifier();
        await v.init();
        await v.prepareNetwork();
        await v.prepareUser(v.user);

        const [taskId, nodeRounds] = await v.prepareTask(v.user, v.accounts);

        const result = "0x01020304050607080807060504030201";
        const cheatingResult = "0x01020304050607171707060504030201"

        const nodeBalances = [];

        for(let i= 0; i < 3; i++) {
            const bal = await ethers.provider.getBalance(v.accounts[i]);
            nodeBalances.push(bal);
        }

        const userBalance = await ethers.provider.getBalance(v.user);

        const nodeGasCosts = [BigInt("0"), BigInt("0"), BigInt("0")];

        const [commitment1, nonce1] = await v.getCommitment(result);
        nodeGasCosts[0] += await getGasCost(await v.taskInstance.connect(v.accounts[0]).submitTaskResultCommitment(
            taskId,
            nodeRounds[v.accounts[0].address],
            commitment1,
            nonce1,
        ));

        const [commitment2, nonce2] = await v.getCommitment(cheatingResult);
        nodeGasCosts[1] += await getGasCost(await v.taskInstance.connect(v.accounts[1]).submitTaskResultCommitment(
            taskId,
            nodeRounds[v.accounts[1].address],
            commitment2,
            nonce2,
        ));

        const [commitment3, nonce3] = await v.getCommitment(result);
        nodeGasCosts[2] += await getGasCost(await v.taskInstance.connect(v.accounts[2]).submitTaskResultCommitment(
            taskId,
            nodeRounds[v.accounts[2].address],
            commitment3,
            nonce3,
        ));

        nodeGasCosts[0] += await getGasCost(await v.taskInstance.connect(v.accounts[0]).discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[0].address],
            result,
        ));

        nodeGasCosts[1] += await getGasCost(await v.taskInstance.connect(v.accounts[1]).discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[1].address],
            cheatingResult,
        ));

        const contract = v.taskInstance.connect(v.accounts[2]);
        const tx = await contract.discloseTaskResult(
            taskId,
            nodeRounds[v.accounts[2].address],
            result,
        );
        nodeGasCosts[2] += await getGasCost(tx);
        await expect(tx).emit(contract, "TaskSuccess").withArgs(
            taskId, anyValue, anyValue);

        const availableNodesAfter = await v.netstatsInstance.availableNodes();
        assert.equal(availableNodesAfter, 1, "Node free");

        let taskInfo = await v.taskInstance.getTask(taskId);
        assert.equal(taskInfo.id, taskId, "task deleted");

        nodeGasCosts[0] += await getGasCost(await v.taskInstance.connect(v.accounts[0]).reportResultsUploaded(
            taskId, nodeRounds[v.accounts[0].address]));
        const availableNodesAfterSuccess = await v.netstatsInstance.availableNodes();
        assert.equal(availableNodesAfterSuccess, 2, "Node free");

        taskInfo = await v.taskInstance.getTask(taskId);
        assert.equal(taskInfo.id, "0", "task not deleted");

        const userBalanceAfter = await ethers.provider.getBalance(v.user);

        assert.equal(
            userBalanceAfter,
            userBalance + ethers.parseUnits("18", "ether"),
            "task fee not returned"
        );

        const bal1 = await ethers.provider.getBalance(v.accounts[0]);
        assert.equal(
            bal1,
            nodeBalances[0] + ethers.parseUnits("20", "ether") - nodeGasCosts[0],
            "task fee not paid"
        );

        const slashedNodeBalance = await ethers.provider.getBalance(v.accounts[1]);
        assert.equal(
            nodeBalances[1] - nodeGasCosts[1],
            slashedNodeBalance,
            "slashed node still paid"
        );

        const bal2 = await ethers.provider.getBalance(v.accounts[2]);
        assert.equal(
            bal2,
            nodeBalances[2] + ethers.parseUnits("12", "ether") - nodeGasCosts[2],
            "task fee not paid"
        );

        for (let i = 0; i < 3; i++) {
            const nodeTaskId = await v.taskInstance.getNodeTask(v.accounts[i]);
            assert.equal(0, nodeTaskId, "incorrect node task");
        }
    });
});
