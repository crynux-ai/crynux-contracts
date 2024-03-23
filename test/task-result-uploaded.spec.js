const Node = artifacts.require("Node");
const CrynuxToken = artifacts.require("CrynuxToken");
const Task = artifacts.require("Task");
const truffleAssert = require('truffle-assertions');

const { prepareTask, prepareNetwork, prepareUser, getCommitment} = require("./utils");

contract("Task", (accounts) => {
    it("should emit TaskResultUploaded when task.reportResultsUploaded is called", async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNetwork(accounts, cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        const result = "0x0102030405060708";

        for(let i= 0; i < 3; i++) {
            const [commitment, nonce] = getCommitment(result);
            await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[2 + i]],
                commitment,
                nonce,
                {from: accounts[2 + i]}
            );
        }

        for(let i = 0; i < 3; i++) {
            await taskInstance.discloseTaskResult(
                taskId,
                nodeRounds[accounts[2 + i]],
                result,
                {from: accounts[2 + i]}
            );
        }

        const tx = await taskInstance.reportResultsUploaded(taskId, nodeRounds[accounts[2]], {from: accounts[2]});
        truffleAssert.eventEmitted(tx, "TaskResultUploaded", (ev) => {
            return ev.taskId.toString() === taskId.toString();
        })
    });
});
