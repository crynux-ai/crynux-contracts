const Node = artifacts.require("Node");
const CrynuxToken = artifacts.require("CrynuxToken");
const Task = artifacts.require("Task");
const truffleAssert = require('truffle-assertions');
const { BN, toWei } = web3.utils;

const { prepareTask, prepareNetwork, prepareUser, getCommitment} = require("./utils");

contract("Task", (accounts) => {
    it("should abort the task when 3 different results are submitted", async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNetwork(accounts, cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        const results = ["0x0102030405060708", "0x010203040506f7f8", "0x0102030405060807"];

        for(let i= 0; i < 3; i++) {
            const [commitment, nonce] = getCommitment(results[i]);
            await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[2 + i]],
                commitment,
                nonce,
                {from: accounts[2 + i]}
            );
        }

        const nodeBalances = [];

        for(let i= 0; i < 3; i++) {
            const bal = await cnxInstance.balanceOf(accounts[2 + i]);
            nodeBalances.push(bal);
        }

        const userBalance = await cnxInstance.balanceOf(accounts[1]);
        let tx;

        for(let i = 0; i < 3; i++) {
            tx = await taskInstance.discloseTaskResult(
                taskId,
                nodeRounds[accounts[2 + i]],
                results[i],
                {from: accounts[2 + i]}
            );
        }

        truffleAssert.eventEmitted(tx, 'TaskAborted', (ev) => {
            return ev.taskId.toString() === taskId.toString();
        });

        const availableNodes = await nodeInstance.availableNodes();
        assert.equal(availableNodes, 3, "Nodes not free");

        const userBalanceAfter = await cnxInstance.balanceOf(accounts[1]);

        assert.equal(
            userBalanceAfter.toString(),
            userBalance.add(new BN(toWei("30", "ether"))).toString(),
            "Task fee not returned"
        )

        for(let i= 0; i < 3; i++) {
            const bal = await cnxInstance.balanceOf(accounts[2 + i]);

            assert.equal(bal.toString(), nodeBalances[i].toString(), "Task fee paid");
        }
    });
});
