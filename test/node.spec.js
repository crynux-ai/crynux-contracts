const Node = artifacts.require("Node");
const CrynuxToken = artifacts.require("CrynuxToken");
const { toWei, BN } = web3.utils;

contract("Node", (accounts) => {
    it("should allow joining and quiting normally", async () => {

        const nodeAccount = accounts[1];

        const nodeInstance = await Node.deployed();
        const cnxInstance = await CrynuxToken.deployed();

        try {
            await nodeInstance.join({from: nodeAccount});
            assert.fail("Transaction not reverted");
        } catch (e) {
            assert.match(e.toString(), /Not enough allowance to stake/, "Wrong reason: " + e.toString());
        }

        await cnxInstance.approve(nodeInstance.address, new BN(toWei("400", "ether")), {from: nodeAccount});

        try {
            await nodeInstance.join({from: nodeAccount});
            assert.fail("Transaction not reverted");
        } catch (e) {
            assert.match(e.toString(), /Not enough token to stake/, "Wrong reason: " + e.toString());
        }

        await cnxInstance.transfer(nodeAccount, new BN(toWei("400", "ether")));

        let status = await nodeInstance.getNodeStatus(nodeAccount);
        assert.equal(status.toNumber(), 0, "Node has joined.")

        await nodeInstance.join({from: nodeAccount});

        status = await nodeInstance.getNodeStatus(nodeAccount);
        assert.equal(status.toNumber(), 1, "Node join failed.");

        const totalNodes = await nodeInstance.totalNodes();
        assert.equal(totalNodes.toNumber(), 1, "Wrong number of nodes");

        const balance = await cnxInstance.balanceOf(nodeAccount);
        assert.equal(balance.toNumber(), 0, "Wrong number of tokens");

        try {
            await nodeInstance.join({from: nodeAccount});
            assert.fail("Transaction not reverted");
        } catch (e) {
            assert.match(e.toString(), /Node already joined/, "Wrong reason: " + e.toString());
        }

        await nodeInstance.quit({from: nodeAccount});

        status = await nodeInstance.getNodeStatus(nodeAccount);
        assert.equal(status.toNumber(), 0, "Node quit failed.")

        const totalNodesRet = await nodeInstance.totalNodes();
        assert.equal(totalNodesRet.toNumber(), 0, "Wrong number of nodes");

        const balanceRet = await cnxInstance.balanceOf(nodeAccount);
        assert.equal(balanceRet.toString(), new BN(toWei("400", "ether").toString(), "Wrong number of tokens"));

        try {
            await nodeInstance.quit({from: nodeAccount});
            assert.fail("Transaction not reverted");
        } catch (e) {
            assert.match(e.toString(), /Node already quited/, "Wrong reason: " + e.toString());
        }
    });

    it("should have the right availability when paused and resumed", async () => {

        const nodeAccount = accounts[1];

        const nodeInstance = await Node.deployed();
        const cnxInstance = await CrynuxToken.deployed();

        await cnxInstance.transfer(nodeAccount, new BN(toWei("400", "ether")));
        await cnxInstance.approve(nodeInstance.address, new BN(toWei("400", "ether")), {from: nodeAccount});

        await nodeInstance.join({from: nodeAccount});

        const totalNodes = await nodeInstance.totalNodes();
        assert.equal(totalNodes.toNumber(), 1, "Wrong number of nodes");

        const availableNodes = await nodeInstance.availableNodes();
        assert.equal(availableNodes.toNumber(), 1, "Wrong number of available nodes");

        const availableNode = await nodeInstance.getAvailableNodeStartsFrom(new BN(0));
        assert.equal(availableNode, nodeAccount, "Wrong node returned");

        await nodeInstance.pause({from: nodeAccount});

        let status = await nodeInstance.getNodeStatus(nodeAccount);
        assert.equal(status.toNumber(), 3, "Node pause failed.")

        const availableNodesAfter = await nodeInstance.availableNodes();
        assert.equal(availableNodesAfter.toNumber(), 0, "Wrong number of available nodes");

        try {
            await nodeInstance.getAvailableNodeStartsFrom(new BN(0));
        } catch (e) {
            assert.match(e.toString(), /Not found/, "Wrong reason: " + e.toString());
        }

        await nodeInstance.resume({from: nodeAccount});
        status = await nodeInstance.getNodeStatus(nodeAccount);
        assert.equal(status.toNumber(), 1, "Node resume failed.");

        const availableNodeAfter = await nodeInstance.getAvailableNodeStartsFrom(new BN(0));
        assert.equal(availableNodeAfter, nodeAccount, "Wrong node returned");

        const availableNodesAfter2 = await nodeInstance.availableNodes();
        assert.equal(availableNodesAfter2.toNumber(), 1, "Wrong number of available nodes");
    });
});
