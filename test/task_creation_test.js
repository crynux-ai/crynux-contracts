const { assert, expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { Verifier } = require("./utils");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { ethers } = require("hardhat")


describe("Task", () => {
    it("should create task after paying", async () => {
        v = new Verifier();
        await v.init();

        const taskType = 0;
        const taskHash = ethers.solidityPackedKeccak256(["string"], ["task hash"]);
        const dataHash = ethers.solidityPackedKeccak256(["string"], ["data hash"]);
        const vramLimit = 0;

        const taskFee = ethers.parseUnits("50", "ether");
        const cap = 1;

        try {
            await v.taskInstance.connect(v.user).createTask(taskType, taskHash, dataHash, vramLimit, cap, {value: taskFee});
            assert.fail('should not pass');
        } catch (e) {
            assert.match(e.toString(), /Sender doesn't have enough funds to send tx/, "Wrong reason: " + e.toString());
        }

        await helpers.setBalance(v.user.address, ethers.parseUnits("60", "ether"));

        await v.prepareNetwork();

        const taskContract = await v.taskInstance.connect(v.user);
        const tx = taskContract.createTask(taskType, taskHash, dataHash, vramLimit, cap, {value: taskFee});
        await expect(tx).emit(taskContract, "TaskStarted").withArgs(
            anyValue, taskType, anyValue, v.accounts[0].address, anyValue, anyValue, anyValue);
        await expect(tx).emit(taskContract, "TaskStarted").withArgs(
            anyValue, taskType, anyValue, v.accounts[1].address, anyValue, anyValue, anyValue);
        await expect(tx).emit(taskContract, "TaskStarted").withArgs(
            anyValue, taskType, anyValue, v.accounts[2].address, anyValue, anyValue, anyValue);

        const availableNodes = await v.netstatsInstance.availableNodes();
        assert.equal(availableNodes, 0, "Wrong number of available nodes");

        await v.nodeInstance.connect(v.accounts[0]).quit();

        // Should be in pending quit status now
        const nodeStatus = await v.nodeInstance.getNodeStatus(v.accounts[0]);
        assert.equal(nodeStatus, 4, "Wrong node status");

        try {
            await v.nodeInstance.connect(v.accounts[0]).quit();
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Illegal node status/, "Wrong reason: " + e.toString());
        }

        await v.nodeInstance.connect(v.accounts[1]).pause();

        // Should be in pending pause status now
        const node2Status = await v.nodeInstance.getNodeStatus(v.accounts[1]);
        assert.equal(node2Status, 3, "Wrong node status");

        try {
            await v.nodeInstance.connect(v.accounts[1]).pause();
            assert.fail("should not pass");
        } catch (e) {
            assert.match(e.toString(), /Illegal node status/, "Wrong reason: " + e.toString());
        }
    });
});
