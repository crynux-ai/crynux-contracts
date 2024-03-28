const { assert, expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { Verifier } = require("./utils");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");


describe("Task", async () => {
    it("should select nodes correctly for SD type task", async () => {
        let v = new Verifier();
        await v.init();

        await v.cnxInstance.transfer(v.user, ethers.parseUnits("600", "ether"));
        await v.cnxInstance.connect(v.user).approve(
            v.taskInstance.target, ethers.parseUnits("600", "ether"));

        const taskType = 0;
        const taskHash = ethers.solidityPackedKeccak256(["string"], ["task hash"]);
        const dataHash = ethers.solidityPackedKeccak256(["string"], ["data hash"]);
        const taskFee = ethers.parseUnits("200", "ether");
        const cap = 1;

        await v.prepareNetwork(
            ["NVIDIA GeForce GTX 1070", "NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti"],
            [8, 16, 16]
        );

        let contract =  await v.taskInstance.connect(v.user);
        let tx = contract.createTask(taskType, taskHash, dataHash, 8, taskFee, cap);
        await expect(tx).emit(contract, "TaskStarted").withArgs(
            anyValue, anyValue, anyValue, v.accounts[0].address, anyValue, anyValue, anyValue);
        await expect(tx).emit(contract, "TaskStarted").withArgs(
            anyValue, anyValue, anyValue, v.accounts[1].address, anyValue, anyValue, anyValue);
        await expect(tx).emit(contract, "TaskStarted").withArgs(
            anyValue, anyValue, anyValue, v.accounts[2].address, anyValue, anyValue, anyValue);

        tx = await (await tx).wait();
        let logs = tx.logs.filter((x) => x.constructor.name == "EventLog");
        let taskId = logs[0].args.taskId;

        // cancel task
        for (let i = 1; i < 4; i++) {
            const nodeAddress = logs[i].args.selectedNode;
            const round = logs[i].args.round;
            const noder = v.accounts.filter(x=>x.address==nodeAddress);
            await v.taskInstance.connect(noder[0]).reportTaskError(taskId, round);
        }

        tx = contract.createTask(taskType, taskHash, dataHash, 0, taskFee, cap);
        await expect(tx).emit(contract, "TaskStarted").withArgs(
            anyValue, anyValue, anyValue, v.accounts[0].address, anyValue, anyValue, anyValue);
        await expect(tx).emit(contract, "TaskStarted").withArgs(
            anyValue, anyValue, anyValue, v.accounts[1].address, anyValue, anyValue, anyValue);
        await expect(tx).emit(contract, "TaskStarted").withArgs(
            anyValue, anyValue, anyValue, v.accounts[2].address, anyValue, anyValue, anyValue);

        tx = await (await tx).wait();
        logs = tx.logs.filter((x) => x.constructor.name == "EventLog");
        taskId = logs[0].args.taskId;
        // cancel task
        for (let i = 1; i < 4; i++) {
            const nodeAddress = logs[i].args.selectedNode;
            const round = logs[i].args.round;
            const noder = v.accounts.filter(x=>x.address==nodeAddress);
            await v.taskInstance.connect(noder[0]).reportTaskError(taskId, round);
        }

        for (let i = 0; i < 3; i++) {
            await v.nodeInstance.connect(v.accounts[i]).quit();
        }
    })
})

describe("Task", async () => {
    it("should select nodes correctly for LLM type task", async () => {
        let v = new Verifier();
        await v.init();


        await v.cnxInstance.transfer(v.user, ethers.parseUnits("600", "ether"));
        await v.cnxInstance.connect(v.user).approve(
            v.taskInstance.target, ethers.parseUnits("600", "ether"));

        const taskType = 1;
        const taskHash = ethers.solidityPackedKeccak256(["string"], ["task hash"]);
        const dataHash = ethers.solidityPackedKeccak256(["string"], ["data hash"]);
        const taskFee = ethers.parseUnits("200", "ether");
        const cap = 1;

        await v.prepareNetwork(
            ["NVIDIA GeForce GTX 1070", "NVIDIA GeForce RTX 4060 Ti", "NVIDIA GeForce RTX 4060 Ti"],
            [8, 16, 16]
        );

        await v.prepareNode(v.accounts[3], "NVIDIA GeForce RTX 4060 Ti", 16);

        let contract = await v.taskInstance.connect(v.user);
        let tx = contract.createTask(taskType, taskHash, dataHash, 8, taskFee, cap);
        await expect(tx).emit(contract, "TaskStarted").withArgs(
            anyValue, anyValue, anyValue, v.accounts[1].address, anyValue, anyValue, anyValue);
        await expect(tx).emit(contract, "TaskStarted").withArgs(
            anyValue, anyValue, anyValue, v.accounts[2].address, anyValue, anyValue, anyValue);
        await expect(tx).emit(contract, "TaskStarted").withArgs(
            anyValue, anyValue, anyValue, v.accounts[3].address, anyValue, anyValue, anyValue);

        tx = await (await tx).wait();
        let logs = tx.logs.filter((x) => x.constructor.name == "EventLog");
        let taskId = logs[0].args.taskId;
        // cancel task
        for (let i = 1; i < 4; i++) {
            const nodeAddress = logs[i].args.selectedNode;
            const round = logs[i].args.round;
            const noder = v.accounts.filter(x=>x.address==nodeAddress);
            await v.taskInstance.connect(noder[0]).reportTaskError(taskId, round);
        }


        tx = await contract.createTask(taskType, taskHash, dataHash, 8, taskFee, cap);
        await expect(tx).emit(contract, "TaskStarted").withArgs(
            anyValue, anyValue, anyValue, v.accounts[1].address, anyValue, anyValue, anyValue);
        await expect(tx).emit(contract, "TaskStarted").withArgs(
            anyValue, anyValue, anyValue, v.accounts[2].address, anyValue, anyValue, anyValue);
        await expect(tx).emit(contract, "TaskStarted").withArgs(
            anyValue, anyValue, anyValue, v.accounts[3].address, anyValue, anyValue, anyValue);


        tx = await (await tx).wait();
        logs = tx.logs.filter((x) => x.constructor.name == "EventLog");
        taskId = logs[0].args.taskId;
        // cancel task
        for (let i = 1; i < 4; i++) {
            const nodeAddress = logs[i].args.selectedNode;
            const round = logs[i].args.round;
            const noder = v.accounts.filter(x=>x.address==nodeAddress);
            await v.taskInstance.connect(noder[0]).reportTaskError(taskId, round);
        }

        for (let i = 0; i < 4; i++) {
            await v.nodeInstance.connect(v.accounts[i]).quit();
        }
    })
})
