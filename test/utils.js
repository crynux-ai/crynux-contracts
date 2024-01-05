const { toWei, BN } = web3.utils;

const prepareNetwork = async (accounts, cnxTokenInstance, nodeInstance, gpuNames = null, gpuVrams = null) => {
    if (!gpuNames) {
        gpuNames = ["NVIDIA GeForce GTX 1070 Ti", "NVIDIA GeForce GTX 1070 Ti", "NVIDIA GeForce GTX 1070 Ti"]
    }
    if (!gpuVrams) {
        gpuVrams = [8, 8, 8]
    }
    assert.equal(gpuNames.length, 3, "gpuNames should have 3 elements")
    assert.equal(gpuNames.length, gpuVrams.length, "gpuNames length should equal to gpuVrams")

    for(let i = 0; i < 3; i++) {
        await prepareNode(accounts[i + 2], cnxTokenInstance, nodeInstance, gpuNames[i], gpuVrams[i]);
    }

    const availableNodes = await nodeInstance.availableNodes();
    assert.equal(availableNodes.toNumber(), 3, "Wrong number of available nodes");
};

const prepareNode = async (nodeAccount, cnxTokenInstance, nodeInstance, gpuName = "NVIDIA GeForce GTX 1070 Ti", gpuVram = 8) => {
    await cnxTokenInstance.transfer(nodeAccount, new BN(toWei("400", "ether")));
    await cnxTokenInstance.approve(nodeInstance.address, new BN(toWei("400", "ether")), {from: nodeAccount});
    await nodeInstance.join(gpuName, gpuVram, {from: nodeAccount});
};

const prepareUser = async(userAccount, cnxTokenInstance, taskInstance) => {
    await cnxTokenInstance.transfer(userAccount, new BN(toWei("500", "ether")));
    await cnxTokenInstance.approve(taskInstance.address, new BN(toWei("500", "ether")), {from: userAccount});
};

const prepareTask = async (accounts, cnxTokenInstance, nodeInstance, taskInstance, taskType = 0, vramLimit = 0) => {

    // Create the task.

    const balBefore = await cnxTokenInstance.balanceOf(accounts[1]);

    const tx = await taskInstance.createTask(
        taskType,
        web3.utils.soliditySha3("task hash"),
        web3.utils.soliditySha3("data hash"),
        vramLimit,
        {from: accounts[1]}
    );

    const balAfter = await cnxTokenInstance.balanceOf(accounts[1]);

    assert.equal(balBefore.toString(), balAfter.add(new BN(toWei("30", "ether"))).toString(), "user task fee not paid");

    assert.equal(tx.logs.length, 3, "wrong log number");

    const taskId = tx.logs[0].args.taskId;
    let nodeRounds = {};

    for (let i = 0; i < 3; i++) {
        const nodeAddress = tx.logs[i].args.selectedNode;
        nodeRounds[nodeAddress] = tx.logs[i].args.round;
    }

    for (let i = 0; i < 3; i++) {
        const nodeTaskId = await taskInstance.getNodeTask(accounts[2 + i]);
        assert.equal(taskId.toString(), nodeTaskId.toString(), "incorrect node task");
    }

    return [taskId, nodeRounds];
};

const getCommitment = (result) => {
    const nonce = web3.utils.soliditySha3(Math.round(Math.random() * 100000000));
    return [web3.utils.soliditySha3(result, nonce), nonce];
};

module.exports = {prepareUser, prepareNetwork, getCommitment, prepareTask, prepareNode};
