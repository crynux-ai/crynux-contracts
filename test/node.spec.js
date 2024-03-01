const Node = artifacts.require("Node");
const CrynuxToken = artifacts.require("CrynuxToken");
const { toWei, BN } = web3.utils;
const crypto = require("crypto");


contract("Node", (accounts) => {
    it("should allow joining and quiting normally", async () => {

        const nodeAccount = accounts[1];

        const gpuName = "NVIDIA GeForce GTX 1070 Ti"
        const gpuVram = 8

        const nodeInstance = await Node.deployed();
        const cnxInstance = await CrynuxToken.deployed();

        try {
            await nodeInstance.join(gpuName, gpuVram, { from: nodeAccount });
            assert.fail("Transaction not reverted");
        } catch (e) {
            assert.match(e.toString(), /Not enough allowance to stake/, "Wrong reason: " + e.toString());
        }

        await cnxInstance.approve(nodeInstance.address, new BN(toWei("400", "ether")), { from: nodeAccount });

        try {
            await nodeInstance.join(gpuName, gpuVram, { from: nodeAccount });
            assert.fail("Transaction not reverted");
        } catch (e) {
            assert.match(e.toString(), /Not enough token to stake/, "Wrong reason: " + e.toString());
        }

        await cnxInstance.transfer(nodeAccount, new BN(toWei("400", "ether")));

        let status = await nodeInstance.getNodeStatus(nodeAccount);
        assert.equal(status.toNumber(), 0, "Node has joined.")

        await nodeInstance.join(gpuName, gpuVram, { from: nodeAccount });

        status = await nodeInstance.getNodeStatus(nodeAccount);
        assert.equal(status.toNumber(), 1, "Node join failed.");

        const totalNodes = await nodeInstance.totalNodes();
        assert.equal(totalNodes.toNumber(), 1, "Wrong number of nodes");

        const balance = await cnxInstance.balanceOf(nodeAccount);
        assert.equal(balance.toNumber(), 0, "Wrong number of tokens");

        const gpus = await nodeInstance.getAvailableGPUs();
        assert.equal(gpus.length, 1, "Wrong gpu number");
        assert.equal(gpus[0].name, gpuName, "Wrong gpu name");
        assert.equal(gpus[0].vram, gpuVram, "Wrong gpu memory");

        try {
            await nodeInstance.join(gpuName, gpuVram, { from: nodeAccount });
            assert.fail("Transaction not reverted");
        } catch (e) {
            assert.match(e.toString(), /Node already joined/, "Wrong reason: " + e.toString());
        }

        await nodeInstance.quit({ from: nodeAccount });

        status = await nodeInstance.getNodeStatus(nodeAccount);
        assert.equal(status.toNumber(), 0, "Node quit failed.")

        const totalNodesRet = await nodeInstance.totalNodes();
        assert.equal(totalNodesRet.toNumber(), 0, "Wrong number of nodes");

        const restGpus = await nodeInstance.getAvailableGPUs();
        assert.equal(restGpus.length, 0, "Wrong gpu number");

        const balanceRet = await cnxInstance.balanceOf(nodeAccount);
        assert.equal(balanceRet.toString(), new BN(toWei("400", "ether").toString(), "Wrong number of tokens"));

        try {
            await nodeInstance.quit({ from: nodeAccount });
            assert.fail("Transaction not reverted");
        } catch (e) {
            assert.match(e.toString(), /Illegal node status/, "Wrong reason: " + e.toString());
        }
    });

    it("should have the right availability when paused and resumed", async () => {

        const nodeAccount = accounts[1];

        const gpuName = "NVIDIA GeForce GTX 1070 Ti"
        const gpuVram = 8

        const nodeInstance = await Node.deployed();
        const cnxInstance = await CrynuxToken.deployed();

        await cnxInstance.transfer(nodeAccount, new BN(toWei("400", "ether")));
        await cnxInstance.approve(nodeInstance.address, new BN(toWei("400", "ether")), { from: nodeAccount });

        await nodeInstance.join(gpuName, gpuVram, { from: nodeAccount });

        let totalNodes = await nodeInstance.totalNodes();
        assert.equal(totalNodes.toNumber(), 1, "Wrong number of nodes");

        let availableNodes = await nodeInstance.getAvailableNodes();
        assert.equal(availableNodes.length, 1, "Wrong number of available nodes");
        assert.equal(availableNodes[0], nodeAccount, "Wrong available node address");

        let availableGPUs = await nodeInstance.getAvailableGPUs();
        assert.equal(availableGPUs.length, 1, "Wrong gpu number");
        assert.equal(availableGPUs[0].name, gpuName, "Wrong gpu name");
        assert.equal(availableGPUs[0].vram, gpuVram, "Wrong gpu memory");

        await nodeInstance.pause({ from: nodeAccount });

        let status = await nodeInstance.getNodeStatus(nodeAccount);
        assert.equal(status.toNumber(), 5, "Node pause failed.")

        availableNodes = await nodeInstance.getAvailableNodes();
        assert.equal(availableNodes.length, 0, "Wrong number of available nodes");

        availableGPUs = await nodeInstance.getAvailableGPUs();
        assert.equal(availableGPUs.length, 0, "Wrong gpu number");

        totalNodes = await nodeInstance.totalNodes();
        assert.equal(totalNodes.toNumber(), 1, "Wrong number of nodes");

        await nodeInstance.resume({ from: nodeAccount });
        status = await nodeInstance.getNodeStatus(nodeAccount);
        assert.equal(status.toNumber(), 1, "Node resume failed.");

        availableNodes = await nodeInstance.getAvailableNodes();
        assert.equal(availableNodes.length, 1, "Wrong number of available nodes");

        availableGPUs = await nodeInstance.getAvailableGPUs();
        assert.equal(availableGPUs.length, 1, "Wrong gpu number");

        totalNodes = await nodeInstance.totalNodes();
        assert.equal(totalNodes.toNumber(), 1, "Wrong number of nodes");

        await nodeInstance.quit({ from: nodeAccount });
    });


    it("should sample nodes correctly", async () => {
        const gpuNames = [
            "NVIDIA GeForce GTX 1070 Ti",
            "NVIDIA GeForce GTX 1070 Ti",
            "NVIDIA GeForce GTX 1070 Ti",
            "NVIDIA GeForce RTX 4060",
            "NVIDIA GeForce GTX 4060",
            "NVIDIA GeForce GTX 4090"
        ];
        const gpuVrams = [8, 8, 8, 8, 16, 24];

        const nodeInstance = await Node.deployed();
        const cnxInstance = await CrynuxToken.deployed();

        for (let i = 0; i < 6; i++) {
            const nodeAddress = accounts[i + 1];

            await cnxInstance.transfer(nodeAddress, new BN(toWei("400", "ether")));
            await cnxInstance.approve(nodeInstance.address, new BN(toWei("400", "ether")), { from: nodeAddress });

            await nodeInstance.join(gpuNames[i], gpuVrams[i], { from: nodeAddress });
        }

        const totalNodes = await nodeInstance.totalNodes();
        assert.equal(totalNodes, 6, "Wrong number of total nodes");

        const availableNodes = await nodeInstance.getAvailableNodes();
        assert.equal(availableNodes.length, 6, "Wrong number of available nodes");

        const availableGPUs = await nodeInstance.getAvailableGPUs();
        assert.equal(availableGPUs.length, 4, "Wrong number of available GPUs");

        let nodeAddress;
        let nodeInfo;

        // filter gpu vram
        let res;

        try {
            await nodeInstance.filterGPUVram(24, 2);
            assert.fail("filterGPUVram not reverted")
        } catch (e) {
            assert.match(e.toString(), /No available node/, "Wrong reason: " + e.toString());
        }

        try {
            await nodeInstance.filterGPUVram(48, 1);
            assert.fail("filterGPUVram not reverted")
        } catch (e) {
            assert.match(e.toString(), /No available node/, "Wrong reason: " + e.toString());
        }

        res = await nodeInstance.filterGPUVram(8, 1);
        let vrams = res[0].map(v => v.toNumber());
        let counts = res[1];
        assert.equal(vrams.length, 3, "Wrong vrams count");
        assert.include(vrams, 8, "Wrong vrams element");
        assert.include(vrams, 16, "Wrong vrams element");
        assert.include(vrams, 24, "Wrong vrams element");
        assert.equal(counts[vrams.indexOf(8)], 4, "Wrong vrams counts element");
        assert.equal(counts[vrams.indexOf(16)], 1, "Wrong vrams counts element");
        assert.equal(counts[vrams.indexOf(24)], 1, "Wrong vrams counts element");

        // select node by gpu vram
        nodeAddress = await nodeInstance.selectNodeByGPUVram(8, crypto.randomInt(2 ** 31 - 1));
        nodeInfo = await nodeInstance.getNodeInfo(nodeAddress);
        assert.equal(Number(nodeInfo.gpu.vram), 8, "Wrong sampled node by gpu memory");

        try {
            await nodeInstance.selectNodeByGPUVram(48, crypto.randomInt(2 ** 31 - 1));
            assert.fail("selectNodeByGPUVram not reverted");
        } catch (e) {
            assert.match(e.toString(), /No available node/, "Wrong reason: " + e.toString());
        }

        // filter gpu id
        try {
            await nodeInstance.filterGPUID(16, 2);
            assert.fail("filterGPUID not reverted");
        } catch (e) {
            assert.match(e.toString(), /No available node/, "Wrong reason: " + e.toString());
        }

        try {
            await nodeInstance.filterGPUID(48, 1);
            assert.fail("filterGPUID not reverted");
        } catch (e) {
            assert.match(e.toString(), /No available node/, "Wrong reason: " + e.toString());
        }
        // sample node by gpu id
        res = await nodeInstance.filterGPUID(24, 1);
        let gpuIDs = res[0];
        counts = res[1];
        assert.equal(gpuIDs.length, 1, "Wrong gpu ids count");
        assert.equal(counts[0], 1, "Wrong gpu ids count element")
        const gpuID = gpuIDs[0];

        nodeAddress = await nodeInstance.selectNodeByGPUID(gpuID, crypto.randomInt(2 ** 31 - 1));
        nodeInfo = await nodeInstance.getNodeInfo(nodeAddress);
        assert.equal(nodeInfo.gpu.name, "NVIDIA GeForce GTX 4090", "Wrong sample node by gpu id");

        // test node quit
        await nodeInstance.quit({ from: nodeAddress });
        try {
            await nodeInstance.filterGPUID(24, 1);
            assert.fail("filterGPUID not reverted");
        } catch (e) {
            assert.match(e.toString(), /No available node/, "Wrong reason: " + e.toString());
        }
        try {
            await nodeInstance.filterGPUVram(24, 1);
            assert.fail("filterGPUVram not reverted");
        } catch (e) {
            assert.match(e.toString(), /No available node/, "Wrong reason: " + e.toString());
        }
        try {
            await nodeInstance.selectNodeByGPUID(gpuID, crypto.randomInt(2 ** 31 - 1));
            assert.fail("selectNodeByGPUID not reverted");
        } catch (e) {
            assert.match(e.toString(), /No available node/, "Wrong reason: " + e.toString());
        }
        try {
            await nodeInstance.selectNodeByGPUVram(24, crypto.randomInt(2 ** 31 - 1));
            assert.fail("selectNodeByGPUVram not reverted");
        } catch (e) {
            assert.match(e.toString(), /No available node/, "Wrong reason: " + e.toString());
        }

        // sample nodes
        nodeAddress = await nodeInstance.selectNode(crypto.randomInt(2 ** 31 - 1));
        nodeInfo = await nodeInstance.getNodeInfo(nodeAddress);
        assert.isAtLeast(Number(nodeInfo.gpu.vram), 8, "Wrong node gpu vram");
        assert.equal(nodeInfo.status, 1, "Wrong node status");
    })
});
