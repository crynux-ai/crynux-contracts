const { assert, expect } = require("chai");
const { ethers } = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

class Verifier {
    async init () {
        var [owner, user, ...accounts] = await ethers.getSigners();
        //accounts = await ethers.getSigners();
        var qosInstance = await ethers.deployContract("QOS");
        var netstatsInstance = await ethers.deployContract("NetworkStats");
        var nodeInstance = await ethers.deployContract(
            "Node", [qosInstance, netstatsInstance]);
        var taskQueueInstance = await ethers.deployContract("TaskQueue");
        var taskInstance = await ethers.deployContract("Task",
            [nodeInstance, qosInstance, taskQueueInstance, netstatsInstance]);
        
        await helpers.setBalance(owner.address, ethers.parseEther("10000"));
        await helpers.setBalance(user.address, 0);
        for (const account of accounts) {
            await helpers.setBalance(account.address, 0);
        }
        await netstatsInstance.updateNodeContractAddress(nodeInstance.target);
        await netstatsInstance.updateTaskContractAddress(taskInstance.target);
        await qosInstance.updateNodeContractAddress(nodeInstance.target);
        await qosInstance.updateTaskContractAddress(taskInstance.target);
        await taskQueueInstance.updateTaskContractAddress(taskInstance.target);
        await nodeInstance.updateTaskContractAddress(taskInstance.target);

        this.taskInstance = taskInstance;
        this.nodeInstance = nodeInstance;
        this.netstatsInstance = netstatsInstance;
        this.qosInstance = qosInstance;
        this.taskQueueInstance = taskQueueInstance;
        this.accounts = accounts;
        this.owner = owner;
        this.user = user;
    }

    async prepareNetwork(gpuNames = null, gpuVrams = null) {
        if (!gpuNames) {
            gpuNames = ["NVIDIA GeForce GTX 1070 Ti", "NVIDIA GeForce GTX 1070 Ti", "NVIDIA GeForce GTX 1070 Ti"]
        }
        if (!gpuVrams) {
            gpuVrams = [8, 8, 8]
        }
        assert.equal(gpuNames.length, 3, "gpuNames should have 3 elements")
        assert.equal(gpuNames.length, gpuVrams.length, "gpuNames length should equal to gpuVrams")
        for(let i = 0; i < 3; i++) {
            await this.prepareNode(this.accounts[i], gpuNames[i], gpuVrams[i]);
        }
    }

    async prepareNode(nodeAccount, gpuName = "NVIDIA GeForce GTX 1070 Ti", gpuVram = 8) {
        await this.owner.sendTransaction({
            value: ethers.parseEther("500"),
            to: nodeAccount
        });
        var nodeContract = this.nodeInstance.connect(nodeAccount);
        await nodeContract.join(gpuName, gpuVram, {value: ethers.parseEther("400")});
    }

    async prepareUser(userAccount) {
        await this.owner.sendTransaction({
            value: ethers.parseEther("500"),
            to: userAccount
        })
    }

    async prepareTask(user, accounts, taskType = 0, vramLimit = 0) {

        // Create the task.

        const balBefore = await ethers.provider.getBalance(user);
        const taskFee = ethers.parseUnits("50", "ether");

        const tx = await this.taskInstance.connect(user).createTask(
            taskType,
            ethers.solidityPackedKeccak256(["string"], ["task hash"]),
            ethers.solidityPackedKeccak256(["string"], ["data hash"]),
            vramLimit,
            1,
            {value: taskFee},
        );
        const receipt = await tx.wait();
        let logs = receipt.logs.filter((x) => x.constructor.name == "EventLog");
        assert.equal(logs.length, 4, "wrong log number");

        const gasCost = receipt.gasUsed * receipt.gasPrice;  
        const balAfter = await ethers.provider.getBalance(user);
        assert.equal(balBefore, balAfter + taskFee + gasCost, "user task fee not paid");

        const taskId = logs[0].args.taskId;
        let nodeRounds = {};

        for (let i = 1; i < 4; i++) {
            const nodeAddress = logs[i].args.selectedNode;
            nodeRounds[nodeAddress] = logs[i].args.round;
        }

        for (let i = 0; i < 3; i++) {
            const nodeTaskId = await this.taskInstance.getNodeTask(this.accounts[i]);
            assert.equal(taskId.toString(), nodeTaskId.toString(), "incorrect node task");
        }

        return [taskId, nodeRounds, taskFee, gasCost];
    }


    async getCommitment(result) {
        const nonce = ethers.solidityPackedKeccak256(["uint"], [Math.round(Math.random() * 100000000)]);
        return [ethers.solidityPackedKeccak256(["bytes", "uint"], [result, nonce]), nonce];
    }

}

async function getGasCost(tx) {
    const receipt = await tx.wait();
    return receipt.gasUsed * receipt.gasPrice;
}

module.exports = {Verifier, getGasCost};
