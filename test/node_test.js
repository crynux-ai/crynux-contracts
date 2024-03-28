const { assert, expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

class NodeVerifier {
    constructor() {
    }
    async init(initToken) {
        var [owner, worker] = await ethers.getSigners();
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


        // check more details
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

describe("Node", () => {
    it("should allow joining and quiting normally", async () => {
        const gpuName = "NVIDIA GeForce GTX 1070 Ti"
        const gpuVram = 8

        let v = new NodeVerifier();
        await v.init("0");

        try {
            await v.nodeFromWorker.join(gpuName, gpuVram);
            assert.fail("Transaction not reverted");
        } catch (e) {
            assert.match(e.toString(), /Not enough allowance to stake/, "Wrong reason: " + e.toString());
        }

        await v.approve("400");
        try {
            await v.nodeFromWorker.join(gpuName, gpuVram);
            assert.fail("Transaction not reverted");
        } catch (e) {
            assert.match(e.toString(), /Not enough token to stake/, "Wrong reason: " + e.toString());
        }

        await v.cnxInstance.transfer(v.worker.address, ethers.parseUnits("400", "ether"));

        let status = await v.nodeFromWorker.getNodeStatus(v.worker.address);
        assert.equal(status, 0, "Node has joined.")
        await v.nodeFromWorker.join(gpuName, gpuVram);
        status = await v.nodeFromWorker.getNodeStatus(v.worker.address);
        assert.equal(status, 1, "Node join failed.");

        const totalNodes = await v.netStatsInstance.totalNodes();
        assert.equal(totalNodes, 1, "Wrong number of nodes");
        const balance = await v.cnxInstance.balanceOf(v.worker.address);
        assert.equal(balance, 0, "Wrong number of tokens");

        const gpus = await v.nodeFromWorker.getAvailableGPUs();
        assert.equal(gpus.length, 1, "Wrong gpu number");
        assert.equal(gpus[0].name, gpuName, "Wrong gpu name");
        assert.equal(gpus[0].vram, gpuVram, "Wrong gpu memory");

        try {
            await v.nodeFromWorker.join(gpuName, gpuVram);
            assert.fail("Transaction not reverted");
        } catch (e) {
            assert.match(e.toString(), /Node already joined/, "Wrong reason: " + e.toString());
        }

        await v.nodeFromWorker.quit();
        status = await v.nodeFromWorker.getNodeStatus(v.worker);
        assert.equal(status, 0n, "Node quit failed.")

        const totalNodesRet = await v.netStatsInstance.activeNodes();
        assert.equal(totalNodesRet, 0n, "Wrong number of nodes");

        const restGpus = await v.nodeFromWorker.getAvailableGPUs();
        assert.equal(restGpus.length, 0, "Wrong gpu number");
        const balanceRet = await v.cnxInstance.balanceOf(v.worker.address);
        assert.equal(balanceRet, ethers.parseUnits("400", "ether"), "Wrong number of tokens");

        try {
            await v.nodeFromWorker.quit();
            assert.fail("Transaction not reverted");
        } catch (e) {
            assert.match(e.toString(), /Illegal node status/, "Wrong reason: " + e.toString());
        }
    });

    it("should have the right availability when paused and resumed", async () => {
        const gpuName = "NVIDIA GeForce GTX 1070 Ti"
        const gpuVram = 8

        let v = new NodeVerifier();
        await v.init("400");
        await v.approve("400");
        await v.nodeFromWorker.join(gpuName, gpuVram);

        let totalNodes = await v.netStatsInstance.totalNodes();
        assert.equal(totalNodes, 1, "Wrong number of nodes");

        let availableNodes = await v.nodeFromWorker.getAvailableNodes();
        assert.equal(availableNodes.length, 1, "Wrong number of available nodes");
        assert.equal(availableNodes[0], v.worker.address, "Wrong available node address");

        let availableGPUs = await v.nodeFromWorker.getAvailableGPUs();
        assert.equal(availableGPUs.length, 1, "Wrong gpu number");
        assert.equal(availableGPUs[0].name, gpuName, "Wrong gpu name");
        assert.equal(availableGPUs[0].vram, gpuVram, "Wrong gpu memory");

        await v.nodeFromWorker.pause();

        let status = await v.nodeFromWorker.getNodeStatus(v.worker.address);
        assert.equal(status, 5, "Node pause failed.")

        availableNodes = await v.nodeFromWorker.getAvailableNodes();
        assert.equal(availableNodes.length, 0, "Wrong number of available nodes");

        availableGPUs = await v.nodeFromWorker.getAvailableGPUs();
        assert.equal(availableGPUs.length, 0, "Wrong gpu number");

        totalNodes = await v.netStatsInstance.totalNodes();
        assert.equal(totalNodes, 1, "Wrong number of nodes");

        await v.nodeFromWorker.resume();
        status = await v.nodeFromWorker.getNodeStatus(v.worker.address);
        assert.equal(status, 1, "Node resume failed.");

        availableNodes = await v.nodeFromWorker.getAvailableNodes();
        assert.equal(availableNodes.length, 1, "Wrong number of available nodes");

        availableGPUs = await v.nodeFromWorker.getAvailableGPUs();
        assert.equal(availableGPUs.length, 1, "Wrong gpu number");

        totalNodes = await v.netStatsInstance.totalNodes();
        assert.equal(totalNodes, 1, "Wrong number of nodes");

        await v.nodeFromWorker.quit();
    });


    it("should sample nodes correctly", async () => {
        const gpuNames = [
            "NVIDIA GeForce GTX 1070 Ti",
            "NVIDIA GeForce GTX 1070 Ti",
            "NVIDIA GeForce GTX 1070 Ti",
            "NVIDIA GeForce RTX 4060",
            "Apple M1 Pro",
            "NVIDIA GeForce GTX 4090"
        ];
        const gpuVrams = [8, 8, 8, 8, 16, 24];

        let v = new NodeVerifier();
        await v.init("400");
        await v.approve("400");
        const accounts = await ethers.getSigners(8);

        for (let i = 0; i < 6; i++) {
            noder = accounts[i+2];
            await v.cnxInstance.transfer(noder.address, ethers.parseUnits("400", "ether"));
            await v.cnxInstance.connect(noder).approve(
                v.nodeFromTask.target, ethers.parseUnits("400", "ether"));
            await v.nodeFromTask.connect(noder).join(gpuNames[i], gpuVrams[i]);
        }

        let totalNodes = await v.netStatsInstance.totalNodes();
        assert.equal(totalNodes, 6, "Wrong number of total nodes");

        let availableNodes = await v.nodeFromWorker.getAvailableNodes();
        assert.equal(availableNodes.length, 6, "Wrong number of available nodes");

        let availableGPUs = await v.nodeFromWorker.getAvailableGPUs();
        assert.equal(availableGPUs.length, 4, "Wrong number of available GPUs");

        let seed = ethers.encodeBytes32String("test");
        // No enough nodes.
        try {
            await v.nodeFromTask.randomSelectNodes(3, 16, false, seed);
            assert.fail("filterGPUID not reverted");
        } catch (e) {
            assert.match(e.toString(), /No available node/, "Wrong reason: " + e.toString());
        }

        // No available v.
        try {
            await v.nodeFromTask.randomSelectNodes(1, 48, false, seed);
            assert.fail("filterGPUID not reverted");
        } catch (e) {
            assert.match(e.toString(), /No available node/, "Wrong reason: " + e.toString());
        }

        // Select node
        res = await v.nodeFromTask.randomSelectNodes(1, 24, false, seed);
        totalNodes = await v.netStatsInstance.totalNodes();
        assert.equal(totalNodes, 6, "Wrong number of total nodes");
        availableNodes = await v.nodeFromWorker.getAvailableNodes();
        assert.equal(availableNodes.length, 5, "Wrong number of available nodes");

        status = await v.nodeFromTask.getNodeStatus(accounts[7]);
        assert.equal(status, 2, "Wrong sample node by gpu id");

        // test node quit
        let nodeContract = await v.nodeFromTask.connect(accounts[7])
        await nodeContract.quit();
        try {
            await v.nodeFromTask.randomSelectNodes(1, 24, false, seed);
            assert.fail("randomSelectNodes not reverted");
        } catch (e) {
            assert.match(e.toString(), /No available node/, "Wrong reason: " + e.toString());
        }
        try {
            await v.nodeFromTask.randomSelectNodes(1, 24, true, seed);
            assert.fail("selectNodeByGPUID not reverted");
        } catch (e) {
            assert.match(e.toString(), /No available node/, "Wrong reason: " + e.toString());
        }
    })
});

describe("Node", async () => {
    it("select nodes with root", async () => {
        const gpuNames = [
            "NVIDIA GeForce GTX 1070 Ti",
            "NVIDIA GeForce GTX 4060",
            "NVIDIA GeForce GTX 4060",
        ];
        const gpuVrams = [8, 16, 16];

        let v = new NodeVerifier();
        await v.init("400");
        await v.approve("400");
        const accounts = await ethers.getSigners(6);

        for (let i = 0; i < 3; i++) {
            const noder = accounts[i + 2];

            await v.cnxInstance.transfer(noder.address, ethers.parseUnits("400", "ether"));
            await v.cnxInstance.connect(noder).approve(
                v.nodeFromTask.target, ethers.parseUnits("400", "ether"));

            await v.nodeFromTask.connect(noder).join(gpuNames[i], gpuVrams[i]);
        }

        let nodes = await v.nodeFromTask.selectNodesWithRoot(accounts[4].address, 3);
        assert.include(nodes, accounts[2].address, "Wrong selected nodes");
        assert.include(nodes, accounts[3].address, "Wrong selected nodes");
        assert.include(nodes, accounts[4].address, "Wrong selected nodes");

        await v.cnxInstance.transfer(accounts[5].address, ethers.parseUnits("400", "ether"));
        await v.cnxInstance.connect(accounts[5]).approve(
            v.nodeFromTask.target, ethers.parseUnits("400", "ether"));

        await v.nodeFromTask.connect(accounts[5]).join("NVIDIA GeForce GTX 4060", 16);

        nodes = await v.nodeFromTask.selectNodesWithRoot(accounts[4].address, 3);
        assert.include(nodes, accounts[3].address, "Wrong selected nodes");
        assert.include(nodes, accounts[4].address, "Wrong selected nodes");
        assert.include(nodes, accounts[5].address, "Wrong selected nodes");
    })
})

describe("Node", async () => {
    it("select apple nodes with root", async () => {
        const gpuNames = [
            "Apple M1",
            "Apple M2 Max",
            "NVIDIA GeForce GTX 4060",
            "NVIDIA GeForce GTX 4060",
        ];
        const gpuVrams = [8, 64, 16, 16];
        let v = new NodeVerifier();
        await v.init("400");
        await v.approve("400");
        const accounts = await ethers.getSigners(7);

        for (let i = 0; i < 4; i++) {
            const noder = accounts[i+2];

            await v.cnxInstance.transfer(noder.address, ethers.parseUnits("400", "ether"));
            await v.cnxInstance.connect(noder).approve(
                v.nodeFromTask.target, ethers.parseUnits("400", "ether"));

            await v.nodeFromTask.connect(noder).join(gpuNames[i], gpuVrams[i]);
        }

        nodes = await v.nodeFromTask.selectNodesWithRoot(accounts[2].address, 3);
        assert.include(nodes, accounts[2].address, "Wrong selected nodes");
        assert.include(nodes, accounts[3].address, "Wrong selected nodes");
        assert.include(nodes, accounts[4].address, "Wrong selected nodes");

        nodes = await v.nodeFromTask.selectNodesWithRoot(accounts[3].address, 3);
        assert.include(nodes, accounts[3].address, "Wrong selected nodes");
        assert.include(nodes, accounts[4].address, "Wrong selected nodes");
        assert.include(nodes, accounts[5].address, "Wrong selected nodes");
    })
})


describe("Node", () => {
    it("should be empty when address is fake", async() => {
        let v = new NodeVerifier();
        await v.init("1000");
        let anotherAddr = ethers.getAddress("0x0000000000000000000000000000000000000123");
        let seed = ethers.encodeBytes32String("test");

        // The behavior is different between truffle and hardhat.
        nodeInfo = await v.nodeFromTask.getNodeInfo(anotherAddr);
        expect(nodeInfo).to.deep.equal([
            0n,
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            ["", 0n],
            0n,
        ])
        nodeStatus = await v.nodeFromTask.getNodeStatus(anotherAddr);
        expect(nodeStatus).equal(0n);
        try {
            await v.nodeFromTask.randomSelectNodes(1, 1, false, seed);
            expect.fail("Transaction not reverted");
        } catch(e) {
            expect(e.toString()).match(/No available node/);
        }
        try {
            await v.nodeFromTask.randomSelectNodes(1, 1, false, ethers.encodeBytes32String("test"));
            expect.fail("Transaction not reverted");
        } catch(e) {
            expect(e.toString()).match(/No available node/);
        }
        try {
            nodeInfo = await v.nodeFromTask.selectNodesWithRoot(anotherAddr, 1);
            expect.fail("Transaction not reverted");
        } catch(e) {
            expect(e.toString()).match(/No available node/);
        }

        var anotherNode = await v.nodeFromTask.connect(anotherAddr);
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

describe("Node", () => {
    it("should behave correctly in status 0 with enough token", async() => {
        let v = new NodeVerifier();
        await v.init("1000")
        await v.checkNode(false, 0n, "1000");
        // QUIT -> Pause
        await v.checkPause(false, false, 0n, "1000");
        // QUIT -> Resume
        await v.checkResume(false, false, 0n, "1000");
        // QUIT -> Slash
        await v.checkSlash(false, false, 0n, "1000");
        // QUIT -> StartTask
        await v.checkStartTask(false, false, 0n, "1000");
        // QUIT -> FinishTask
        await v.checkFinishTask(false, false, 0n, "1000");
        // QUIT -> Quit
        await v.checkQuit(false, false, 0n, "1000");
        // QUIT -> Join
        await v.checkJoin(false, false, 0n, "1000", /Not enough allowance to stake/);
        await v.approve("100");
        await v.checkJoin(false, false, 0n, "1000", /Not enough allowance to stake/);
        await v.approve("500");
        await v.checkJoin(true, true, 1n, "600", null);
    })
})

describe("Node", () => {
    it("should behave correctly in status 0 without enough token", async() => {
        let v = new NodeVerifier()
        await v.init("100")
        await v.checkNode(false, 0n, "100");
        // QUIT -> Pause
        await v.checkPause(false, false, 0n, "100");
        // QUIT -> Resume
        await v.checkResume(false, false, 0n, "100");
        // QUIT -> Slash
        await v.checkSlash(false, false, 0n, "100");
        // QUIT -> StartTask
        await v.checkStartTask(false, false, 0n, "100");
        // QUIT -> FinishTask
        await v.checkFinishTask(false, false, 0n, "100");
        // QUIT -> Quit
        await v.checkQuit(false, false, 0n, "100");
        // QUIT -> Join without enough staken allowance
        await v.checkJoin(false, false, 0n, "100", /Not enough allowance to stake/);
        await v.approve("500");
        // QUIT -> Join with enough staken allowance
        await v.checkJoin(false, false, 0n, "100", /Not enough token to stake/);
    })
})


describe("Node", () => {
    it("should behave correctly in status 1", async() => {
        let v = new NodeVerifier();
        await v.init("500");
        await v.checkNode(false, 0n, "500");
        await v.approve("400");
        await v.checkJoin(true, true, 1n, "100", null);
        // AVAILABLE -> Join
        await v.checkJoin(false, true, 1n, "100", /Node already joined/);
        // AVAILABLE -> Resume
        await v.checkResume(false, true, 1n, "100");
        // AVAILABLE -> Pause
        await v.checkPause(true, true, 5n, "100");
        await v.checkResume(true, true, 1n, "100");
        // AVAILABLE -> StartTask
        await v.checkStartTask(true, true, 2n, "100");
        await v.checkFinishTask(true, true, 1n, "100");
        // AVAILABLE -> FinishTask
        await v.checkFinishTask(false, true, 1n, "100");
        // AVAILABLE -> Slash
        await v.checkSlash(false, true, 1n, "100");
        // AVAILABLE -> Quit
        await v.checkQuit(false, true, 1n, "100");
    })
})
