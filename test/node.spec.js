const Node = artifacts.require("Node");
const CrynuxToken = artifacts.require("CrynuxToken");
const NetworkStats = artifacts.require("NetworkStats");
const { toWei, BN } = web3.utils;
const crypto = require("crypto");


contract("Node", (accounts) => {
    it("should allow joining and quiting normally", async () => {

        const nodeAccount = accounts[1];

        const gpuName = "NVIDIA GeForce GTX 1070 Ti"
        const gpuVram = 8

        const nodeInstance = await Node.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const netStatsInstance = await NetworkStats.deployed();

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

        const totalNodes = await netStatsInstance.totalNodes();
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

        const totalNodesRet = await netStatsInstance.activeNodes();
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
        const netStatsInstance = await NetworkStats.deployed();

        await cnxInstance.transfer(nodeAccount, new BN(toWei("400", "ether")));
        await cnxInstance.approve(nodeInstance.address, new BN(toWei("400", "ether")), { from: nodeAccount });

        await nodeInstance.join(gpuName, gpuVram, { from: nodeAccount });

        let totalNodes = await netStatsInstance.totalNodes();
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

        totalNodes = await netStatsInstance.totalNodes();
        assert.equal(totalNodes.toNumber(), 1, "Wrong number of nodes");

        await nodeInstance.resume({ from: nodeAccount });
        status = await nodeInstance.getNodeStatus(nodeAccount);
        assert.equal(status.toNumber(), 1, "Node resume failed.");

        availableNodes = await nodeInstance.getAvailableNodes();
        assert.equal(availableNodes.length, 1, "Wrong number of available nodes");

        availableGPUs = await nodeInstance.getAvailableGPUs();
        assert.equal(availableGPUs.length, 1, "Wrong gpu number");

        totalNodes = await netStatsInstance.totalNodes();
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
        const netStatsInstance = await NetworkStats.deployed();

        for (let i = 0; i < 6; i++) {
            const nodeAddress = accounts[i + 1];

            await cnxInstance.transfer(nodeAddress, new BN(toWei("400", "ether")));
            await cnxInstance.approve(nodeInstance.address, new BN(toWei("400", "ether")), { from: nodeAddress });

            await nodeInstance.join(gpuNames[i], gpuVrams[i], { from: nodeAddress });
        }

        const totalNodes = await netStatsInstance.totalNodes();
        assert.equal(totalNodes, 6, "Wrong number of total nodes");

        const availableNodes = await nodeInstance.getAvailableNodes();
        assert.equal(availableNodes.length, 6, "Wrong number of available nodes");

        const availableGPUs = await nodeInstance.getAvailableGPUs();
        assert.equal(availableGPUs.length, 4, "Wrong number of available GPUs");

        let nodeAddress;
        let nodeInfo;

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
        assert.equal(gpuIDs.length, 1, "Wrong gpu ids count");
        const gpuID = gpuIDs[0];

        res = await nodeInstance.filterNodesByGPUID(gpuID);
        nodeAddress = res[0][0];
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
            await nodeInstance.filterNodesByGPUID(gpuID);
            assert.fail("selectNodeByGPUID not reverted");
        } catch (e) {
            assert.match(e.toString(), /No available node/, "Wrong reason: " + e.toString());
        }
    })
});

contract("Node", async (accounts) => {
    it("select nodes with root", async () => {
        const gpuNames = [
            "NVIDIA GeForce GTX 1070 Ti",
            "NVIDIA GeForce GTX 4060",
            "NVIDIA GeForce GTX 4060",
        ];
        const gpuVrams = [8, 16, 16];

        const nodeInstance = await Node.deployed();
        const cnxInstance = await CrynuxToken.deployed();

        for (let i = 0; i < 3; i++) {
            const nodeAddress = accounts[i + 1];

            await cnxInstance.transfer(nodeAddress, new BN(toWei("400", "ether")));
            await cnxInstance.approve(nodeInstance.address, new BN(toWei("400", "ether")), { from: nodeAddress });

            await nodeInstance.join(gpuNames[i], gpuVrams[i], { from: nodeAddress });
        }

        let nodes = await nodeInstance.selectNodesWithRoot(accounts[3], 3, {from: accounts[0]});
        assert.include(nodes, accounts[1], "Wrong selected nodes");
        assert.include(nodes, accounts[2], "Wrong selected nodes");
        assert.include(nodes, accounts[3], "Wrong selected nodes");

        await cnxInstance.transfer(accounts[4], new BN(toWei("400", "ether")));
        await cnxInstance.approve(nodeInstance.address, new BN(toWei("400", "ether")), { from: accounts[4] });

        await nodeInstance.join("NVIDIA GeForce GTX 4060", 16, { from: accounts[4] });

        nodes = await nodeInstance.selectNodesWithRoot(accounts[3], 3, {from: accounts[0]});
        assert.include(nodes, accounts[2], "Wrong selected nodes");
        assert.include(nodes, accounts[3], "Wrong selected nodes");
        assert.include(nodes, accounts[4], "Wrong selected nodes");

    })
})