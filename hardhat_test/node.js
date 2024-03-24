const { expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");


class NodeVerifier {
    constructor() {
    }
    async init(initToken) {
        const [owner, worker] = await ethers.getSigners();
        const qosInstance = await ethers.deployContract("QOS");
        const netStatsInstance = await ethers.deployContract("NetworkStats");
        var cnxInstance = await ethers.deployContract("CrynuxToken");
        var nodeInstance = await ethers.deployContract(
            "Node", [cnxInstance, qosInstance, netStatsInstance]);
        
        const taskQueueInstance = await ethers.deployContract("TaskQueue");
        let taskFactory = await ethers.getContractFactory("Task");
        var taskInstance = await taskFactory.connect(owner).deploy(
            nodeInstance, cnxInstance, qosInstance, taskQueueInstance, netStatsInstance);
        await nodeInstance.updateTaskContractAddress(taskInstance.target);
        await helpers.impersonateAccount(taskInstance.target);
        var taskSigner = await ethers.getSigner(taskInstance.target);
        await helpers.setBalance(taskSigner.address, ethers.parseUnits("100000", "ether"));
        taskInstance = await taskInstance.connect(taskSigner);

        var nodeFromWorker = await nodeInstance.connect(worker);
        this.nodeFromWorker = nodeFromWorker;
        var nodeFromTask = await nodeInstance.connect(taskSigner);
        this.nodeFromTask = nodeFromTask;
        this.cnxInstance = cnxInstance;
        this.netStatsInstance = netStatsInstance;
        this.taskInstance = taskInstance;

        this.owner = owner;
        this.worker = worker;
        this.tasker = taskSigner;
        await netStatsInstance.updateNodeContractAddress(this.nodeFromWorker.target)
        await qosInstance.updateNodeContractAddress(this.nodeFromWorker.target)
        await this.cnxInstance.transfer(this.worker.address, ethers.parseUnits(initToken, "ether"));
    }

    async approve(token) {
        await this.cnxInstance.connect(this.worker).approve(
            this.nodeFromTask.target, ethers.parseUnits(token, "ether"));
    }

    _checkSuccess(success) {
        if (!success) expect.fail("Transaction not reverted");
    }
    _checkFail(success) {
        if (success) expect.fail("Transaction failed");
    }

    async checkNode(contains, nodeStatus, balance) {
        let status = await this.nodeFromTask.getNodeStatus(this.worker.address);
        expect(status).equal(nodeStatus);
        if (!contains) {
            let totalNodesRet = await this.nodeFromTask.getAvailableNodes();
            expect(totalNodesRet.length).equal(0);
            let restGpus = await this.nodeFromTask.getAvailableGPUs();
            expect(restGpus.length).equal(0);
            try {
                await this.nodeFromTask.getNodeInfo(this.worker.address);
            } catch(e) {
                expect(e.toString()).match(/invalid address/);
            }
        } else {
            let nodeInfo = await this.nodeFromTask.getNodeInfo(this.worker.address);
            expect(nodeInfo.status).equal(nodeStatus);
        }
        
        let balanceRet = await this.cnxInstance.balanceOf(this.worker.address);
        expect(balanceRet).equal(ethers.parseUnits(balance, "ether"));
    }

    async checkJoin(success, contains, nodeStatus, balance, errExp) {
        try {
            await this.nodeFromWorker.join("Apple M1", 8);
            this._checkSuccess(success);
        } catch (e) {
            expect(e.toString()).match(errExp);
            this._checkFail(success);
        }
        await this.checkNode(contains, nodeStatus, balance);
    }
        
    async checkPause(success, contains, nodeStatus, balance) {
        try {
            await this.nodeFromWorker.pause();
            this._checkSuccess(success);
        } catch (e) {
            expect(e.toString()).to.match(/Illegal node status/);
            this._checkFail(success);
        }
        await this.checkNode(contains, nodeStatus, balance);
    }

    async checkResume(success, contains, nodeStatus, balance) {
        try {
            await this.nodeFromWorker.resume();
            this._checkSuccess(success);
        } catch(e) {
            expect(e.toString()).to.match(/Illegal node status/);
            this._checkFail(success);
        }
        await this.checkNode(contains, nodeStatus, balance);
    }

    async checkSlash(success, contains, nodeStatus, balance) {
        try {
            await this.nodeFromWorker.slash(this.worker.address);
            this._checkSuccess(success);
        } catch(e) {
            expect(e.toString()).to.match(/Not called by the task contract/);
            this._checkFail(success);
        }

        try {
            await this.nodeFromTask.slash(this.worker.address);
            this._checkSuccess(success);
        }  catch(e) {
            expect(e.toString()).to.match(/Illegal node status/);
            this._checkFail(success);
        }
        await this.checkNode(contains, nodeStatus, balance);
    }

    async checkStartTask(success, contains, nodeStatus, balance) {
        try {
            await this.nodeFromTask.startTask(this.worker.address);
            this._checkSuccess(success);
        } catch(e) {
            expect(e.toString()).to.match(/Node is not available/);
            this._checkFail(success);
        }
        await this.checkNode(contains, nodeStatus, balance);
    }

    async checkFinishTask(success, contains, nodeStatus, balance) {
        try {
            await this.nodeFromTask.finishTask(this.worker.address);
            this._checkSuccess(success);
        } catch(e) {
            expect(e.toString()).to.match(/Illegal node status/);
            this._checkFail(success);

        }
        await this.checkNode(contains, nodeStatus, balance);
    }

    async checkQuit(success, contains, nodeStatus, balance) {
        try {
            await this.nodeFromTask.finishTask(this.worker.address);
            this._checkSuccess(success);
        } catch(e) {
            expect(e.toString()).to.match(/Illegal node status/);
            this._checkFail(success);
        }
        await this.checkNode(contains, nodeStatus, balance);
    }
}

describe("Node", (accounts) => {
    it("should be empty when address is fake", async() => {
        let node = new NodeVerifier();
        await node.init("1000");
        let anotherAddr = ethers.getAddress("0x0000000000000000000000000000000000000123");
        
        // The behavior is different between truffle and hardhat.
        nodeInfo = await node.nodeFromTask.getNodeInfo(anotherAddr);
        expect(nodeInfo).to.deep.equal([
            0n,
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            ["", 0n],
            0n,
        ])
        nodeStatus = await node.nodeFromTask.getNodeStatus(anotherAddr);
        expect(nodeStatus).equal(0n);
        try {
            await node.nodeFromTask.filterGPUID(8, 2);
            expect.fail("Transaction not reverted");
        } catch(e) {
            expect(e.toString()).match(/No available node/);
        }     
        try {
            await node.nodeFromTask.filterNodesByGPUID(ethers.encodeBytes32String("test"));
            expect.fail("Transaction not reverted");
        } catch(e) {
            expect(e.toString()).match(/No available node/);
        }
        try {
            nodeInfo = await node.nodeFromTask.selectNodesWithRoot(anotherAddr, 1);
            expect.fail("Transaction not reverted");
        } catch(e) {
            expect(e.toString()).match(/No available node/);
        }

        var anotherNode = await node.nodeFromTask.connect(anotherAddr);
        try {
            await anotherNode.quit();
            expect.fail("Transaction not reverted");
        } catch(e) {
            expect(e.toString()).match(/contract runner does not support sending transactions/);
        }
        try {
            await anotherNode.pause();
            expect.fail("Transaction not reverted");
        } catch(e) {
            expect(e.toString()).match(/contract runner does not support sending transactions/);
        }
        try {
            await anotherNode.resume();
            expect.fail("Transaction not reverted");
        } catch(e) {
            expect(e.toString()).match(/contract runner does not support sending transactions/);
        }
        try {
            nodeInfo = await anotherNode.slash(123);
            expect.fail("Transaction not reverted");
        } catch(e) {
            expect(e.toString()).match(/contract runner does not support sending transactions/);
        }
        try {
            nodeInfo = await anotherNode.startTask(123);
            expect.fail("Transaction not reverted");
        } catch(e) {
            expect(e.toString()).match(/contract runner does not support sending transactions/);
        }
        try {
            nodeInfo = await anotherNode.finishTask(123);
            expect.fail("Transaction not reverted");
        } catch(e) {
            expect(e.toString()).match(/contract runner does not support sending transactions/);
        }
        
    })
})

describe("Node", (accounts) => {
    it("should behave correctly in status 0 with enough token", async() => {
        let node = new NodeVerifier();
        await node.init("1000")
        await node.checkNode(false, 0n, "1000");
        // QUIT -> Pause
        await node.checkPause(false, false, 0n, "1000");
        // QUIT -> Resume
        await node.checkResume(false, false, 0n, "1000");
        // QUIT -> Slash
        await node.checkSlash(false, false, 0n, "1000");
        // QUIT -> StartTask
        await node.checkStartTask(false, false, 0n, "1000");
        // QUIT -> FinishTask
        await node.checkFinishTask(false, false, 0n, "1000");
        // QUIT -> Quit
        await node.checkQuit(false, false, 0n, "1000");
        // QUIT -> Join
        await node.checkJoin(false, false, 0n, "1000", /Not enough allowance to stake/);
        await node.approve("100");
        await node.checkJoin(false, false, 0n, "1000", /Not enough allowance to stake/);
        await node.approve("500");
        await node.checkJoin(true, true, 1n, "600", null);
    })
})

describe("Node", (accounts) => {
    it("should behave correctly in status 0 without enough token", async() => {
        let node = new NodeVerifier()
        await node.init("100")
        await node.checkNode(false, 0n, "100");
        // QUIT -> Pause
        await node.checkPause(false, false, 0n, "100");
        // QUIT -> Resume
        await node.checkResume(false, false, 0n, "100");
        // QUIT -> Slash
        await node.checkSlash(false, false, 0n, "100");
        // QUIT -> StartTask
        await node.checkStartTask(false, false, 0n, "100");
        // QUIT -> FinishTask
        await node.checkFinishTask(false, false, 0n, "100");
        // QUIT -> Quit
        await node.checkQuit(false, false, 0n, "100");
        // QUIT -> Join without enough staken allowance
        await node.checkJoin(false, false, 0n, "100", /Not enough allowance to stake/);
        await node.approve("500");
        // QUIT -> Join with enough staken allowance
        await node.checkJoin(false, false, 0n, "100", /Not enough token to stake/);
    })
})


describe("Node", () => {
    it("should behave correctly in status 1", async() => {
        let node = new NodeVerifier();
        await node.init("500");
        await node.checkNode(false, 0n, "500");
        await node.approve("400");
        await node.checkJoin(true, true, 1n, "100", null);
        // AVAILABLE -> Resume
        await node.checkResume(false, true, 1n, "100");
        // AVAILABLE -> Pause
        await node.checkPause(true, true, 5n, "100");
        await node.checkResume(true, true, 1n, "100");
        // AVAILABLE -> StartTask
        await node.checkStartTask(true, true, 2n, "100");
        await node.checkFinishTask(true, true, 1n, "100");
        // AVAILABLE -> FinishTask
        await node.checkFinishTask(false, true, 1n, "100");
        // AVAILABLE -> Slash
        await node.checkSlash(false, true, 1n, "100");
        // AVAILABLE -> Quit
        await node.checkQuit(false, true, 1n, "100");
    })
})



