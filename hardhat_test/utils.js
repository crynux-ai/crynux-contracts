const { assert, expect } = require("chai");

class Verifier {
    async init () {
        var [owner, user, ...accounts] = await ethers.getSigners();
        //accounts = await ethers.getSigners();
        var cnxInstance = await ethers.deployContract("CrynuxToken");
        var qosInstance = await ethers.deployContract("QOS");
        var netstatsInstance = await ethers.deployContract("NetworkStats");
        var nodeInstance = await ethers.deployContract(
            "Node", [cnxInstance, qosInstance, netstatsInstance]);
        var taskQueueInstance = await ethers.deployContract("TaskQueue");
        var taskInstance = await ethers.deployContract("Task",
            [nodeInstance, cnxInstance, qosInstance, taskQueueInstance, netstatsInstance]);

        await netstatsInstance.updateNodeContractAddress(nodeInstance.target);
        await netstatsInstance.updateTaskContractAddress(taskInstance.target);
        await qosInstance.updateNodeContractAddress(nodeInstance.target);
        await qosInstance.updateTaskContractAddress(taskInstance.target);
        await taskQueueInstance.updateTaskContractAddress(taskInstance.target);
        await nodeInstance.updateTaskContractAddress(taskInstance.target);

        this.taskInstance = taskInstance;
        this.cnxInstance = cnxInstance;
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
        await this.cnxInstance.transfer(nodeAccount.address, ethers.parseUnits("400", "ether"));
        await this.cnxInstance.connect(nodeAccount).approve(this.nodeInstance.target, ethers.parseUnits("400", "ether"));
        var nodeContract = await this.nodeInstance.connect(nodeAccount);
        await nodeContract.join(gpuName, gpuVram);
    }

    async prepareUser(userAccount) {
        await this.cnxInstance.transfer(userAccount.address, ethers.parseUnits("500", "ether"));
        await this.cnxInstance.connect(userAccount).approve(this.taskInstance.target, ethers.parseUnits("500", "ether"));
    }

    async prepareTask(user, accounts, taskType = 0, vramLimit = 0) {

        // Create the task.

        const balBefore = await this.cnxInstance.balanceOf(user);
        const taskFee = ethers.parseUnits("50", "ether");

        let tx = await this.taskInstance.connect(user).createTask(
            taskType,
            ethers.solidityPackedKeccak256(["string"], ["task hash"]),
            ethers.solidityPackedKeccak256(["string"], ["data hash"]),
            vramLimit,
            taskFee,
            1,
        );
        tx = await tx.wait();
        let logs = tx.logs.filter((x) => x.constructor.name == "EventLog");
        assert.equal(logs.length, 4, "wrong log number");

        const balAfter = await this.cnxInstance.balanceOf(user);
        assert.equal(balBefore, balAfter + taskFee, "user task fee not paid");

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

        return [taskId, nodeRounds];
    }


    async getCommitment(result) {
        const nonce = ethers.solidityPackedKeccak256(["uint"], [Math.round(Math.random() * 100000000)]);
        return [ethers.solidityPackedKeccak256(["bytes", "uint"], [result, nonce]), nonce];
    }

}

module.exports = {Verifier};
