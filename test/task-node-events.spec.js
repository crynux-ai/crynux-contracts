const Node = artifacts.require("Node");
const CrynuxToken = artifacts.require("CrynuxToken");
const Task = artifacts.require("Task");
const truffleAssert = require('truffle-assertions');
const { time } = require("@openzeppelin/test-helpers")

const { prepareTask, prepareNetwork, prepareUser, getCommitment} = require("./utils");

contract("Task", (accounts) => {
    it("should emit 3 TaskNodeSuccess when all nodes run correctly", async () => {
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

        await taskInstance.reportResultsUploaded(taskId, nodeRounds[accounts[2]], {from: accounts[2]});

        const events = await taskInstance.getPastEvents("TaskNodeSuccess", {fromBlock: 0, toBlock: "latest"});
        assert.equal(events.length, 3, "Wrong event count");
        for (const event of events) {
            assert.equal(event.args.taskId.toString(), taskId.toString(), "Wrong taskId");

            assert.include(accounts.slice(2, 5), event.args.nodeAddress);
        }
    });
});

contract("Task", (accounts) => {
    it("should emit 2 TaskNodeSuccess and 1 TaskNodeSlashed when two nodes run correctly and a node cheats", async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNetwork(accounts, cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        const result = "0x0102030405060708";
        const fakeResult = "0x010203040506f7f8";

        for(let i= 0; i < 2; i++) {
            const [commitment, nonce] = getCommitment(result);
            await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[2 + i]],
                commitment,
                nonce,
                {from: accounts[2 + i]}
            );
        }

        {
            const [commitment, nonce] = getCommitment(fakeResult);
            await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[4]],
                commitment,
                nonce,
                {from: accounts[4]}
            );

        }

        for(let i = 0; i < 2; i++) {
            await taskInstance.discloseTaskResult(
                taskId,
                nodeRounds[accounts[2 + i]],
                result,
                {from: accounts[2 + i]}
            );
        }

        {
            await taskInstance.discloseTaskResult(
                taskId,
                nodeRounds[accounts[4]],
                fakeResult,
                {from: accounts[4]}
            );
        }

        await taskInstance.reportResultsUploaded(taskId, nodeRounds[accounts[2]], {from: accounts[2]});

        const successEvents = await taskInstance.getPastEvents("TaskNodeSuccess", {fromBlock: 0, toBlock: "latest"});
        assert.equal(successEvents.length, 2, "Wrong event count");
        for (const event of successEvents) {
            assert.equal(event.args.taskId.toString(), taskId.toString(), "Wrong taskId");

            assert.include(accounts.slice(2, 4), event.args.nodeAddress);
        }

        const slashEvents = await taskInstance.getPastEvents("TaskNodeSlashed", {fromBlock: 0, toBlock: "latest"});
        assert.equal(slashEvents.length, 1, "Wrong event count");
        assert.equal(slashEvents[0].args.taskId.toString(), taskId.toString(), "Wrong taskId");
        assert.equal(slashEvents[0].args.nodeAddress, accounts[4], "Wrong taskId");
    });
});

contract("Task", (accounts) => {
    it("should emit 2 TaskNodeSuccess and 1 TaskNodeSlashed when two nodes run correctly and a node reports error", async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNetwork(accounts, cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        const result = "0x0102030405060708";

        for(let i= 0; i < 2; i++) {
            const [commitment, nonce] = getCommitment(result);
            await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[2 + i]],
                commitment,
                nonce,
                {from: accounts[2 + i]}
            );
        }

        {
            await taskInstance.reportTaskError(
                taskId,
                nodeRounds[accounts[4]],
                {from: accounts[4]}
            );
        }

        for(let i = 0; i < 2; i++) {
            await taskInstance.discloseTaskResult(
                taskId,
                nodeRounds[accounts[2 + i]],
                result,
                {from: accounts[2 + i]}
            );
        }

        await taskInstance.reportResultsUploaded(taskId, nodeRounds[accounts[2]], {from: accounts[2]});

        const successEvents = await taskInstance.getPastEvents("TaskNodeSuccess", {fromBlock: 0, toBlock: "latest"});
        assert.equal(successEvents.length, 2, "Wrong event count");
        for (const event of successEvents) {
            assert.equal(event.args.taskId.toString(), taskId.toString(), "Wrong taskId");

            assert.include(accounts.slice(2, 4), event.args.nodeAddress);
        }

        const slashEvents = await taskInstance.getPastEvents("TaskNodeSlashed", {fromBlock: 0, toBlock: "latest"});
        assert.equal(slashEvents.length, 1, "Wrong event count");
        assert.equal(slashEvents[0].args.taskId.toString(), taskId.toString(), "Wrong taskId");
        assert.equal(slashEvents[0].args.nodeAddress, accounts[4], "Wrong taskId");
    });
});

contract("Task", (accounts) => {
    it("should emit 2 TaskNodeSuccess and 1 TaskNodeCancelled when two nodes disclose correctly and a node is timeout", async () => {
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

        for(let i = 0; i < 2; i++) {
            await taskInstance.discloseTaskResult(
                taskId,
                nodeRounds[accounts[2 + i]],
                result,
                {from: accounts[2 + i]}
            );
        }

        await taskInstance.reportResultsUploaded(taskId, nodeRounds[accounts[2]], {from: accounts[2]});

        const successEvents = await taskInstance.getPastEvents("TaskNodeSuccess", {fromBlock: 0, toBlock: "latest"});
        assert.equal(successEvents.length, 2, "Wrong event count");
        for (const event of successEvents) {
            assert.equal(event.args.taskId.toString(), taskId.toString(), "Wrong taskId");

            assert.include(accounts.slice(2, 4), event.args.nodeAddress);
        }

        await time.increase(time.duration.hours(1));
        await taskInstance.cancelTask(taskId, {from: accounts[4]});

        const cancelEvents = await taskInstance.getPastEvents("TaskNodeCancelled", {fromBlock: 0, toBlock: "latest"});
        assert.equal(cancelEvents.length, 1, "Wrong event count");
        assert.equal(cancelEvents[0].args.taskId.toString(), taskId.toString(), "Wrong taskId");
        assert.equal(cancelEvents[0].args.nodeAddress, accounts[4], "Wrong taskId");
    });
});

contract("Task", (accounts) => {
    it("should emit 3 TaskNodeCancelled when two nodes submit result commitments correctly and a node is timeout", async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNetwork(accounts, cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);

        const result = "0x0102030405060708";

        for(let i= 0; i < 2; i++) {
            const [commitment, nonce] = getCommitment(result);
            await taskInstance.submitTaskResultCommitment(
                taskId,
                nodeRounds[accounts[2 + i]],
                commitment,
                nonce,
                {from: accounts[2 + i]}
            );
        }

        await time.increase(time.duration.hours(1));
        await taskInstance.cancelTask(taskId, {from: accounts[4]});

        const successEvents = await taskInstance.getPastEvents("TaskNodeCancelled", {fromBlock: 0, toBlock: "latest"});
        assert.equal(successEvents.length, 3, "Wrong event count");
        for (const event of successEvents) {
            assert.equal(event.args.taskId.toString(), taskId.toString(), "Wrong taskId");

            assert.include(accounts.slice(2, 5), event.args.nodeAddress);
        }
    });
});

contract("Task", (accounts) => {
    it("should emit 3 TaskNodeCancelled when one node disclose correctly and two nodes are timeout", async () => {
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

        await taskInstance.discloseTaskResult(
            taskId,
            nodeRounds[accounts[2]],
            result,
            {from: accounts[2]}
        )

        await time.increase(time.duration.hours(1));
        await taskInstance.cancelTask(taskId, {from: accounts[4]});

        const events = await taskInstance.getPastEvents("TaskNodeCancelled", {fromBlock: 0, toBlock: "latest"});
        assert.equal(events.length, 3, "Wrong event count");
        for (const event of events) {
            assert.equal(event.args.taskId.toString(), taskId.toString(), "Wrong taskId");

            assert.include(accounts.slice(2, 5), event.args.nodeAddress);
        }
    });
});

contract("Task", (accounts) => {
    it("should emit 3 TaskNodeSuccess when three nodes report task error", async () => {
        const taskInstance = await Task.deployed();
        const cnxInstance = await CrynuxToken.deployed();
        const nodeInstance = await Node.deployed();

        await prepareNetwork(accounts, cnxInstance, nodeInstance);
        await prepareUser(accounts[1], cnxInstance, taskInstance);

        const [taskId, nodeRounds] = await prepareTask(accounts, cnxInstance, nodeInstance, taskInstance);


        for(let i= 0; i < 3; i++) {
            await taskInstance.reportTaskError(
                taskId,
                nodeRounds[accounts[2 + i]],
                {from: accounts[2 + i]}
            );
        }

        const events = await taskInstance.getPastEvents("TaskNodeSuccess", {fromBlock: 0, toBlock: "latest"});
        assert.equal(events.length, 3, "Wrong event count");
        for (const event of events) {
            assert.equal(event.args.taskId.toString(), taskId.toString(), "Wrong taskId");

            assert.include(accounts.slice(2, 5), event.args.nodeAddress);
        }
    });
});
