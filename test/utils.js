const { toWei, BN } = web3.utils;

const prepareNetwork = async (accounts, cnxTokenInstance, nodeInstance) => {

    for(let i = 2; i < 5; i++) {
        const nodeAccount = accounts[i];
        await cnxTokenInstance.transfer(nodeAccount, new BN(toWei("400", "ether")));
        await cnxTokenInstance.approve(nodeInstance.address, new BN(toWei("400", "ether")), {from: nodeAccount});
        await nodeInstance.join({from: nodeAccount});
    }

    const availableNodes = await nodeInstance.availableNodes();
    assert.equal(availableNodes.toNumber(), 3, "Wrong number of available nodes");
};

const prepareUser = async(userAccount, cnxTokenInstance, taskInstance) => {
    await cnxTokenInstance.transfer(userAccount, new BN(toWei("500", "ether")));
    await cnxTokenInstance.approve(taskInstance.address, new BN(toWei("500", "ether")), {from: userAccount});
};

const prepareTask = async (accounts, cnxTokenInstance, nodeInstance, taskInstance) => {

    // Create the task.

    const balBefore = await cnxTokenInstance.balanceOf(accounts[1]);

    const clientId = Math.round(Math.random() * 10000000);

    const tx = await taskInstance.createTask(
        new BN(clientId),
        web3.utils.soliditySha3("task hash"),
        web3.utils.soliditySha3("data hash"),
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

module.exports = {prepareUser, prepareNetwork, getCommitment, prepareTask};
